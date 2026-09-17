import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type Stripe from "stripe";
import sharp from "sharp";
import { z } from "zod";
import {
  sponsorCreativeSchema,
  MAX_ICON_BYTES,
  SPONSOR_PRICE_CENTS,
  SPONSOR_DURATION_DAYS,
  type PurchaseStatus,
} from "../../src/lib/sponsorPurchase.ts";
import { sponsors, TOTAL_SPONSOR_SLOTS } from "../../src/lib/sponsors.ts";
import { database, transaction } from "./db.ts";
import { getConfig, getStripe, SponsorError } from "./config.ts";

export interface Purchase {
  id: string;
  buyer_id: string;
  request_id: string;
  request_hash: string;
  name: string;
  url: string;
  description: string;
  icon: Buffer;
  status: PurchaseStatus;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  checkout_url: string | null;
  checkout_expires_at: Date;
  starts_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  paid_event_id: string | null;
  analytics_id: string | null;
}

export async function normalizeIcon(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_ICON_BYTES)
    throw new SponsorError("invalid_icon");
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !webp) throw new SponsorError("invalid_icon");
  try {
    return await sharp(bytes, {
      limitInputPixels: 1024 * 1024,
      animated: false,
    })
      .rotate()
      .resize(128, 128, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new SponsorError("invalid_icon");
  }
}

async function capacity(db: PoolClient) {
  const { rows } = await db.query<{
    count: number;
  }>(`SELECT count(*)::int AS count FROM sponsor_purchases
    WHERE status IN ('creating','pending','attention') OR (status IN ('active','disputed') AND expires_at > now())`);
  return Math.max(0, TOTAL_SPONSOR_SLOTS - sponsors.length - rows[0].count);
}

export async function catalog() {
  const { rows } = await database()
    .query<Purchase>(`SELECT id, name, url, description, starts_at, expires_at
    FROM sponsor_purchases WHERE status='active' AND starts_at <= now() AND expires_at > now() ORDER BY starts_at, id`);
  const available = await transaction(capacity);
  return {
    sponsors: rows.map((p) => ({
      id: p.id,
      name: p.name,
      url: p.url,
      claim: p.description,
      kind: "paid" as const,
      icon: `/api/sponsors?action=icon&id=${p.id}`,
      expiresAt: p.expires_at!.toISOString(),
    })),
    availableSpots: available,
    checkoutEnabled: true,
    testMode: !getConfig().live,
    priceEur: SPONSOR_PRICE_CENTS / 100,
    durationDays: SPONSOR_DURATION_DAYS,
  };
}

export async function reservePurchase(
  buyerId: string,
  form: FormData,
  rateKey: string,
) {
  const creative = sponsorCreativeSchema.safeParse(
    Object.fromEntries(
      ["name", "url", "description"].map((k) => [k, form.get(k)]),
    ),
  );
  const requestId = z.uuid().safeParse(form.get("requestId"));
  const iconFile = form.get("icon");
  if (!creative.success || !requestId.success)
    throw new SponsorError("invalid_form");
  if (!(iconFile instanceof File)) throw new SponsorError("invalid_icon");
  const icon = await normalizeIcon(Buffer.from(await iconFile.arrayBuffer()));
  const hash = createHash("sha256")
    .update(JSON.stringify(creative.data))
    .update(icon)
    .digest("hex");
  const attribution = z
    .string()
    .min(1)
    .max(200)
    .safeParse(form.get("analyticsId"));
  return transaction(async (db) => {
    const { rows: existing } = await db.query<Purchase>(
      "SELECT * FROM sponsor_purchases WHERE buyer_id=$1 AND request_id=$2",
      [buyerId, requestId.data],
    );
    if (existing[0]) {
      if (existing[0].request_hash !== hash)
        throw new SponsorError("request_changed", 409);
      return existing[0];
    }
    const { rows: open } = await db.query(
      "SELECT id FROM sponsor_purchases WHERE buyer_id=$1 AND status IN ('creating','pending','attention')",
      [buyerId],
    );
    if (open.length) throw new SponsorError("existing_checkout", 409);
    const limit = await db.query<{ count: number }>(
      `INSERT INTO sponsor_rate_limits(key, count, expires_at)
      VALUES($1,1,now()+interval '1 hour') ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN sponsor_rate_limits.expires_at < now() THEN 1 ELSE sponsor_rate_limits.count+1 END,
      expires_at=CASE WHEN sponsor_rate_limits.expires_at < now() THEN now()+interval '1 hour' ELSE sponsor_rate_limits.expires_at END RETURNING count`,
      [rateKey],
    );
    if (limit.rows[0].count > 5) throw new SponsorError("rate_limited", 429);
    if ((await capacity(db)) === 0) throw new SponsorError("sold_out", 409);
    const { rows } = await db.query<Purchase>(
      `INSERT INTO sponsor_purchases
      (id,buyer_id,request_id,request_hash,name,url,description,icon,status,checkout_expires_at,analytics_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'creating',now()+interval '40 minutes',$9) RETURNING *`,
      [
        randomUUID(),
        buyerId,
        requestId.data,
        hash,
        creative.data.name,
        creative.data.url,
        creative.data.description,
        icon,
        attribution.success ? attribution.data : null,
      ],
    );
    return rows[0];
  });
}

export async function ensureCheckout(purchaseId: string, buyerId: string) {
  const stripe = getStripe();
  const config = getConfig();
  // Commit the customer mapping before any session can be created remotely.
  const customerId = await transaction(async (db) => {
    const { rows } = await db.query<{ stripe_customer_id: string | null }>(
      "SELECT stripe_customer_id FROM sponsor_buyers WHERE id=$1",
      [buyerId],
    );
    if (!rows[0]) throw new SponsorError("not_found", 404);
    if (rows[0].stripe_customer_id) return rows[0].stripe_customer_id;
    const customer = await stripe.customers.create(
      { metadata: { unmarker_buyer_id: buyerId } },
      { idempotencyKey: `unmarker-customer-${buyerId}` },
    );
    await db.query(
      "UPDATE sponsor_buyers SET stripe_customer_id=$2 WHERE id=$1",
      [buyerId, customer.id],
    );
    return customer.id;
  });
  return transaction(async (db) => {
    const { rows } = await db.query<Purchase>(
      "SELECT * FROM sponsor_purchases WHERE id=$1 AND buyer_id=$2 FOR UPDATE",
      [purchaseId, buyerId],
    );
    const purchase = rows[0];
    if (!purchase) throw new SponsorError("not_found", 404);
    if (
      purchase.stripe_session_id ||
      !["creating", "attention"].includes(purchase.status)
    )
      return purchase;
    // Recover a possible remote success before a local transaction/network failure.
    for await (const session of stripe.checkout.sessions.list({
      customer: customerId,
      limit: 100,
      created: { gte: Math.floor(purchase.created_at.getTime() / 1000) - 60 },
    })) {
      if (session.metadata?.unmarker_purchase_id === purchase.id)
        return attachSession(db, purchase.id, session);
    }
    if (Date.now() > purchase.created_at.getTime() + 5 * 60_000) {
      // The fixed Checkout expiry can no longer satisfy Stripe's 30-minute minimum.
      // Retain the reservation for reconciliation; never recreate an uncertain charge.
      const status: PurchaseStatus =
        Date.now() > purchase.checkout_expires_at.getTime()
          ? "cancelled"
          : "attention";
      await db.query(
        "UPDATE sponsor_purchases SET status=$2, updated_at=now() WHERE id=$1",
        [purchase.id, status],
      );
      return { ...purchase, status };
    }
    const price = await stripe.prices.retrieve(config.priceId);
    if (
      !price.active ||
      price.type !== "one_time" ||
      price.currency !== "eur" ||
      price.unit_amount !== SPONSOR_PRICE_CENTS ||
      price.livemode !== config.live
    )
      throw new SponsorError("unavailable", 503);
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        // NoMaDe remains the seller, regardless of the account's Managed Payments default.
        managed_payments: { enabled: false },
        adaptive_pricing: { enabled: false },
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{ price: config.priceId, quantity: 1 }],
        client_reference_id: purchase.id,
        metadata: {
          unmarker_purchase_id: purchase.id,
          unmarker_buyer_id: buyerId,
        },
        payment_intent_data: {
          metadata: { unmarker_purchase_id: purchase.id },
        },
        expires_at: Math.floor(purchase.checkout_expires_at.getTime() / 1000),
        success_url: `${config.origin}/?sponsor_purchase=${purchase.id}`,
        cancel_url: `${config.origin}/?sponsor_purchase=${purchase.id}&sponsor_cancelled=1`,
        custom_text: {
          submit: {
            message:
              "One payment for 30 days on Unmarker.it. No automatic renewal. Your placement starts when payment is confirmed.",
          },
        },
      },
      { idempotencyKey: `unmarker-checkout-${purchase.id}` },
    );
    return attachSession(db, purchase.id, session);
  });
}

async function attachSession(
  db: PoolClient,
  id: string,
  session: Stripe.Checkout.Session,
) {
  const { rows } = await db.query<Purchase>(
    `UPDATE sponsor_purchases SET stripe_session_id=$2,
    checkout_url=$3,checkout_expires_at=to_timestamp($4),status='pending',updated_at=now() WHERE id=$1 RETURNING *`,
    [id, session.id, session.url, session.expires_at],
  );
  return rows[0];
}

export function publicPurchase(p: Purchase) {
  return {
    id: p.id,
    status:
      p.status === "active" && p.expires_at!.getTime() <= Date.now()
        ? "expired"
        : p.status,
    name: p.name,
    startsAt: p.starts_at?.toISOString() ?? null,
    expiresAt: p.expires_at?.toISOString() ?? null,
    checkoutUrl: p.status === "pending" ? p.checkout_url : null,
  };
}

export async function ownedPurchase(id: string, buyerId: string) {
  const { rows } = await database().query<Purchase>(
    "SELECT * FROM sponsor_purchases WHERE id=$1 AND buyer_id=$2",
    [id, buyerId],
  );
  if (!rows[0]) throw new SponsorError("not_found", 404);
  return rows[0];
}

async function successfulPaymentEvent(
  pi: Stripe.PaymentIntent,
  event?: Stripe.Event,
) {
  if (
    event?.type === "payment_intent.succeeded" &&
    event.data.object.id === pi.id
  )
    return event;
  // Stripe's event time is payment confirmation; Session/PaymentIntent creation is earlier.
  for await (const candidate of getStripe().events.list({
    type: "payment_intent.succeeded",
    created: { gte: pi.created },
    limit: 100,
  })) {
    if ((candidate.data.object as Stripe.PaymentIntent).id === pi.id)
      return candidate;
  }
  return null;
}

async function syncLocked(
  db: PoolClient,
  purchase: Purchase,
  event?: Stripe.Event,
) {
  if (!purchase.stripe_session_id) return purchase;
  const stripe = getStripe();
  const config = getConfig();
  const session = await stripe.checkout.sessions.retrieve(
    purchase.stripe_session_id,
    { expand: ["line_items.data.price", "payment_intent.latest_charge"] },
  );
  const { rows: buyers } = await db.query<{ stripe_customer_id: string }>(
    "SELECT stripe_customer_id FROM sponsor_buyers WHERE id=$1",
    [purchase.buyer_id],
  );
  const item = session.line_items?.data[0];
  if (
    session.livemode !== config.live ||
    session.mode !== "payment" ||
    session.customer !== buyers[0].stripe_customer_id ||
    session.client_reference_id !== purchase.id ||
    session.metadata?.unmarker_purchase_id !== purchase.id ||
    session.currency !== "eur" ||
    session.amount_total !== SPONSOR_PRICE_CENTS ||
    session.line_items?.data.length !== 1 ||
    item?.price?.id !== config.priceId ||
    item.quantity !== 1
  )
    throw new SponsorError("payment_mismatch", 409);
  let status = purchase.status;
  let paidAt = purchase.starts_at;
  let paidEventId = purchase.paid_event_id;
  const pi =
    typeof session.payment_intent === "object" ? session.payment_intent : null;
  if (session.payment_status === "paid" && pi?.status === "succeeded") {
    if (pi.currency !== "eur" || pi.amount_received !== SPONSOR_PRICE_CENTS)
      throw new SponsorError("payment_mismatch", 409);
    if (!paidAt) {
      const confirmation = await successfulPaymentEvent(pi, event);
      if (!confirmation) throw new SponsorError("payment_pending", 503);
      paidAt = new Date(confirmation.created * 1000);
      paidEventId = confirmation.id;
    }
    status = "active";
    const charge =
      typeof pi.latest_charge === "object" ? pi.latest_charge : null;
    if (!charge?.paid) throw new SponsorError("payment_pending", 503);
    // Partial refunds compensate downtime without ending or extending the campaign.
    // Stripe's cumulative total also covers multiple refunds that repay the full payment.
    if (charge.amount_refunded >= pi.amount_received) status = "refunded";
    if (charge.disputed) {
      const disputes = await stripe.disputes.list({
        payment_intent: pi.id,
        limit: 100,
      });
      if (
        disputes.data.some(
          (d) => d.status !== "won" && d.status !== "warning_closed",
        )
      )
        status = "disputed";
    }
    if (
      status === "active" &&
      paidAt.getTime() + SPONSOR_DURATION_DAYS * 86_400_000 <= Date.now()
    )
      status = "expired";
  } else if (session.status === "expired") status = "cancelled";
  const { rows } = await db.query<Purchase>(
    `UPDATE sponsor_purchases SET status=$2,starts_at=$3,
    expires_at=CASE WHEN $3::timestamptz IS NULL THEN NULL ELSE $3::timestamptz + interval '720 hours' END,
    paid_event_id=$4,stripe_payment_intent_id=$5,last_synced_at=now(),updated_at=now() WHERE id=$1 RETURNING *`,
    [purchase.id, status, paidAt, paidEventId, pi?.id ?? null],
  );
  if (paidAt) {
    // Durable outbox: analytics failure must never prevent payment fulfillment.
    for (const name of [
      "sponsor_purchase_confirmed",
      "sponsor_campaign_activated",
    ]) {
      if (name === "sponsor_campaign_activated" && status !== "active")
        continue;
      await db.query(
        `INSERT INTO sponsor_analytics_outbox(id,purchase_id,event) VALUES($1,$2,$3) ON CONFLICT(purchase_id,event) DO NOTHING`,
        [randomUUID(), purchase.id, name],
      );
    }
  }
  return rows[0];
}

export async function syncSponsorPurchase(id: string, event?: Stripe.Event) {
  return transaction(async (db) => {
    const { rows } = await db.query<Purchase>(
      "SELECT * FROM sponsor_purchases WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (!rows[0]) throw new SponsorError("not_found", 404);
    return syncLocked(db, rows[0], event);
  });
}

export async function processWebhook(event: Stripe.Event) {
  const object = event.data.object as unknown as {
    id: string;
    metadata?: Record<string, string>;
    payment_intent?: string;
  };
  const id = object.metadata?.unmarker_purchase_id;
  return transaction(async (db) => {
    if (
      (
        await db.query("SELECT id FROM sponsor_webhook_receipts WHERE id=$1", [
          event.id,
        ])
      ).rowCount
    )
      return;
    const { rows } = await db.query<Purchase>(
      `SELECT * FROM sponsor_purchases WHERE id::text=$1 OR stripe_session_id=$2
      OR stripe_payment_intent_id=$2 OR stripe_payment_intent_id=$3 FOR UPDATE`,
      [id ?? "", object.id, object.payment_intent ?? ""],
    );
    const purchase = rows[0];
    if (purchase) {
      // A webhook can beat the response that attaches the Checkout Session.
      if (
        !purchase.stripe_session_id &&
        event.type.startsWith("checkout.session.")
      ) {
        await attachSession(
          db,
          purchase.id,
          event.data.object as Stripe.Checkout.Session,
        );
        purchase.stripe_session_id = object.id;
      }
      if (!purchase.stripe_session_id)
        throw new SponsorError("payment_pending", 503);
      await syncLocked(db, purchase, event);
    }
    await db.query("INSERT INTO sponsor_webhook_receipts(id) VALUES($1)", [
      event.id,
    ]);
  });
}

export async function cancelPurchase(id: string, buyerId: string) {
  const purchase = await ownedPurchase(id, buyerId);
  if (purchase.stripe_session_id && purchase.status === "pending") {
    const session = await getStripe().checkout.sessions.retrieve(
      purchase.stripe_session_id,
    );
    if (session.status === "open")
      await getStripe().checkout.sessions.expire(session.id);
  }
  return syncSponsorPurchase(id);
}

export async function reconcilePurchases() {
  const { rows } = await database()
    .query<Purchase>(`SELECT * FROM sponsor_purchases WHERE
    status IN ('creating','pending','attention','active','disputed') ORDER BY last_synced_at NULLS FIRST LIMIT 40`);
  let synced = 0;
  const failures: string[] = [];
  for (const purchase of rows) {
    try {
      if (!purchase.stripe_session_id) {
        await ensureCheckout(purchase.id, purchase.buyer_id);
      }
      await syncSponsorPurchase(purchase.id);
      synced++;
    } catch {
      failures.push(purchase.id);
    }
  }
  await database().query(
    "DELETE FROM sponsor_rate_limits WHERE expires_at < now() - interval '1 day'",
  );
  return { synced, failures };
}

export async function flushAnalytics() {
  const apiKey = process.env.POSTHOG_API_KEY;
  // Keep Stripe test purchases out of production analytics.
  if (!apiKey || !getConfig().live) return;
  const { rows } = await database().query<{
    id: string;
    event: string;
    purchase_id: string;
    analytics_id: string | null;
    starts_at: Date;
  }>(`SELECT o.*,p.analytics_id,p.starts_at FROM sponsor_analytics_outbox o
    JOIN sponsor_purchases p ON p.id=o.purchase_id WHERE delivered_at IS NULL LIMIT 50`);
  for (const row of rows) {
    if (row.analytics_id) {
      const response = await fetch(
        `${process.env.POSTHOG_HOST || "https://eu.i.posthog.com"}/i/v0/e/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(5000),
          body: JSON.stringify({
            api_key: apiKey,
            event: row.event,
            uuid: row.id,
            timestamp: row.starts_at.toISOString(),
            properties: {
              distinct_id: row.analytics_id,
              purchase_id: row.purchase_id,
              sponsor_id: row.purchase_id,
              sponsor_kind: "paid",
              price_eur: 500,
              currency: "EUR",
              duration_days: 30,
              payment_model: "one_time",
              $insert_id: row.id,
            },
          }),
        },
      );
      if (!response.ok) throw new Error("Sponsor analytics delivery failed");
    }
    await database().query(
      "UPDATE sponsor_analytics_outbox SET delivered_at=now() WHERE id=$1",
      [row.id],
    );
  }
}
