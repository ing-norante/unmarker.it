import { parseConsent } from "../../src/lib/consentPolicy.ts";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { database, transaction } from "./db.ts";
import { getConfig, getStripe, SponsorError } from "./config.ts";
import {
  catalog,
  reservePurchase,
  ensureCheckout,
  publicPurchase,
  ownedPurchase,
  syncSponsorPurchase,
  processWebhook,
  cancelPurchase,
  reconcilePurchases,
  flushAnalytics,
  updateSponsorConsent,
  type Purchase,
} from "./service.ts";

const WEBHOOK_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.expired",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "payment_intent.succeeded",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
]);
const cookieName = "unmarker_sponsor_session";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function checkOrigin(request: Request) {
  if (
    request.headers.get("origin") !== getConfig().origin ||
    request.headers.get("x-sponsor-client") !== "1"
  )
    throw new SponsorError("forbidden", 403);
}

function token(request: Request) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

async function buyer(request: Request) {
  const value = token(request);
  if (!value) throw new SponsorError("session_expired", 401);
  const { rows } = await database().query<{ id: string }>(
    "SELECT id FROM sponsor_buyers WHERE token_hash=$1 AND expires_at>now()",
    [hash(value)],
  );
  if (!rows[0]) throw new SponsorError("session_expired", 401);
  return rows[0].id;
}

function ipKey(request: Request, purpose: string) {
  // Trust Vercel's platform IP header only on Vercel, never arbitrary local forwarding headers.
  const ip = process.env.VERCEL
    ? (request.headers.get("x-vercel-forwarded-for")?.split(",")[0] ??
      "unknown")
    : "local";
  return createHmac("sha256", getConfig().secret)
    .update(`${purpose}:${ip}`)
    .digest("hex");
}

async function session(request: Request) {
  try {
    return json({ ready: true, buyerId: await buyer(request) });
  } catch (error) {
    if (!(error instanceof SponsorError) || error.status !== 401) throw error;
  }
  const value = randomBytes(32).toString("hex");
  await transaction(async (db) => {
    const { rows } = await db.query<{ count: number }>(
      `INSERT INTO sponsor_rate_limits(key,count,expires_at)
      VALUES($1,1,now()+interval '1 hour') ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN sponsor_rate_limits.expires_at<now() THEN 1 ELSE sponsor_rate_limits.count+1 END,
      expires_at=CASE WHEN sponsor_rate_limits.expires_at<now() THEN now()+interval '1 hour' ELSE sponsor_rate_limits.expires_at END RETURNING count`,
      [ipKey(request, "session")],
    );
    if (rows[0].count > 30) throw new SponsorError("rate_limited", 429);
    await db.query("INSERT INTO sponsor_buyers(id,token_hash) VALUES($1,$2)", [
      randomUUID(),
      hash(value),
    ]);
  });
  const secure = getConfig().origin.startsWith("https://") ? "; Secure" : "";
  return json({ ready: true }, 200, {
    "Set-Cookie": `${cookieName}=${value}; HttpOnly; SameSite=Lax; Path=/api/sponsors; Max-Age=10368000${secure}`,
  });
}

async function boundedBody(request: Request, max = 400_000) {
  if (Number(request.headers.get("content-length")) > max)
    throw new SponsorError("request_too_large", 413);
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const parts: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > max) {
      await reader.cancel();
      throw new SponsorError("request_too_large", 413);
    }
    parts.push(part.value);
  }
  return Buffer.concat(parts);
}

export async function handleSponsorRequest(
  request: Request,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "catalog";
    if (action === "catalog" && request.method === "GET") {
      try {
        return json(await catalog());
      } catch (error) {
        // Optional backend: image tools and house ads keep working during an outage.
        if (!(error instanceof SponsorError))
          console.error("Sponsor catalog unavailable");
        return json({
          sponsors: [],
          availableSpots: 0,
          checkoutEnabled: false,
          testMode: false,
        });
      }
    }
    // Choosing cookies must not create a buyer session or require a configured checkout backend.
    if (action === "consent" && request.method === "POST" && !token(request))
      return json({ synced: true });
    getConfig();
    if (action === "webhook" && request.method === "POST") {
      const secret = getConfig().webhookSecret;
      if (!secret) throw new SponsorError("unavailable", 503);
      const body = await boundedBody(request, 2_000_000);
      let event;
      try {
        event = getStripe().webhooks.constructEvent(
          body,
          request.headers.get("stripe-signature") ?? "",
          secret,
        );
      } catch {
        throw new SponsorError("invalid_signature", 400);
      }
      if (event.livemode !== getConfig().live)
        throw new SponsorError("wrong_environment", 400);
      if (WEBHOOK_EVENTS.has(event.type)) await processWebhook(event);
      await flushAnalytics().catch(() =>
        console.error("Sponsor analytics delivery will retry"),
      );
      return json({ received: true });
    }
    if (action === "reconcile" && request.method === "GET") {
      const secret = process.env.CRON_SECRET;
      const expected = Buffer.from(`Bearer ${secret}`);
      const actual = Buffer.from(request.headers.get("authorization") ?? "");
      if (
        !secret ||
        secret.length < 32 ||
        actual.length !== expected.length ||
        !timingSafeEqual(expected, actual)
      )
        throw new SponsorError("forbidden", 403);
      const result = await reconcilePurchases();
      await flushAnalytics();
      return json(result, result.failures.length ? 503 : 200);
    }
    if (action === "icon" && request.method === "GET") {
      const id = z.uuid().safeParse(url.searchParams.get("id"));
      if (!id.success) throw new SponsorError("not_found", 404);
      const { rows } = await database().query<{ icon: Buffer }>(
        "SELECT icon FROM sponsor_purchases WHERE id=$1 AND status='active' AND expires_at>now()",
        [id.data],
      );
      if (!rows[0]) throw new SponsorError("not_found", 404);
      return new Response(new Uint8Array(rows[0].icon), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=300",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (request.method !== "POST")
      return json({ error: "method_not_allowed" }, 405, { Allow: "POST" });
    checkOrigin(request);
    if (action === "session") return await session(request);
    if (action === "consent") {
      let buyerId: string;
      try {
        buyerId = await buyer(request);
      } catch (error) {
        if (error instanceof SponsorError && error.status === 401)
          return json({ synced: true });
        throw error;
      }
      const choice = parseConsent(
        JSON.parse((await boundedBody(request, 1024)).toString()),
      );
      if (!choice) throw new SponsorError("invalid_form");
      await updateSponsorConsent(buyerId, choice);
      return json({ synced: true });
    }
    const buyerId = await buyer(request);
    if (action === "checkout") {
      const raw = await boundedBody(request);
      const form = await new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: raw,
      }).formData();
      const purchase = await reservePurchase(
        buyerId,
        form,
        ipKey(request, "checkout"),
      );
      return json(publicPurchase(await ensureCheckout(purchase.id, buyerId)));
    }
    if (action === "purchases") {
      const { rows } = await database().query<Purchase>(
        "SELECT * FROM sponsor_purchases WHERE buyer_id=$1 ORDER BY created_at DESC LIMIT 20",
        [buyerId],
      );
      return json({ purchases: rows.map(publicPurchase) });
    }
    const input = z
      .object({ id: z.uuid() })
      .safeParse(JSON.parse((await boundedBody(request, 1024)).toString()));
    if (!input.success) throw new SponsorError("invalid_form");
    const purchase = await ownedPurchase(input.data.id, buyerId);
    if (action === "status") {
      if (!purchase.stripe_session_id)
        await ensureCheckout(purchase.id, buyerId);
      const synced = await syncSponsorPurchase(purchase.id);
      await flushAnalytics().catch(() =>
        console.error("Sponsor analytics delivery will retry"),
      );
      return json(publicPurchase(synced));
    }
    if (action === "cancel")
      return json(publicPurchase(await cancelPurchase(purchase.id, buyerId)));
    throw new SponsorError("not_found", 404);
  } catch (error) {
    if (error instanceof SponsorError)
      return json({ error: error.code }, error.status);
    if (error instanceof SyntaxError || error instanceof TypeError)
      return json({ error: "invalid_form" }, 400);
    // Do not leak Stripe responses, billing data, secrets or raw request bodies.
    console.error(
      "Sponsor request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return json({ error: "temporary_error" }, 503);
  }
}
