import { billingDefaults } from "../../src/lib/sponsorBilling";
import { createConsent } from "../../src/lib/consentPolicy";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
import Stripe from "stripe";
import sharp from "sharp";
import { database } from "./db";
import {
  reservePurchase,
  ensureCheckout,
  syncSponsorPurchase,
  processWebhook,
  catalog,
  normalizeIcon,
  cancelPurchase,
  reconcilePurchases,
  updateSponsorConsent,
  flushAnalytics,
} from "./service";
import { handleSponsorRequest } from "./http";
import { stopSponsorPublication } from "./administration";
import { purchaseConfirmation } from "./confirmation";
import { publicPurchase } from "./service";

const fake = vi.hoisted(() => ({
  customers: new Map<string, Stripe.CustomerCreateParams>(),
  verification: "verified" as string,
  taxRegistered: true,
  rejectTaxId: false,
  sessions: new Map<string, Stripe.Checkout.Session>(),
  events: [] as Stripe.Event[],
  creates: 0,
  failRetrieve: false,
  analyticsLive: false,
  disputes: [] as Stripe.Dispute[],
}));
vi.mock("./config.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("./config")>();
  const real = new Stripe("sk_test_mock");
  return {
    ...original,
    getConfig: () => ({ ...original.getConfig(), live: fake.analyticsLive }),
    getStripe: () => ({
      customers: {
        create: async (params: Stripe.CustomerCreateParams) => {
          if (fake.rejectTaxId)
            throw new Stripe.errors.StripeInvalidRequestError({
              type: "invalid_request_error",
              code: "tax_id_invalid",
              message: "Invalid test tax ID",
            });
          const id = `cus_${randomUUID()}`;
          fake.customers.set(id, params);
          return { id };
        },
        listTaxIds: async (id: string) => ({
          data:
            fake.customers.get(id)?.tax_id_data?.map((t) => ({
              ...t,
              verification: { status: fake.verification },
            })) ?? [],
        }),
      },
      products: {
        retrieve: async () => ({ id: "prod_test", tax_code: "txcd_10701000" }),
      },
      tax: {
        settings: {
          retrieve: async () => ({
            status: "active",
            head_office: { address: { country: "IT" } },
          }),
        },
        registrations: {
          list: async () => ({
            data: fake.taxRegistered ? [{ country: "IT" }] : [],
          }),
        },
      },
      prices: {
        retrieve: async (id: string) => ({
          id,
          active: true,
          type: "one_time",
          currency: "eur",
          unit_amount: 50000,
          product: "prod_test",
          tax_behavior: "exclusive",
          livemode: false,
        }),
      },
      checkout: {
        sessions: {
          list: async function* ({ customer }: { customer: string }) {
            for (const session of fake.sessions.values())
              if (session.customer === customer) yield structuredClone(session);
          },
          create: async (params: Stripe.Checkout.SessionCreateParams) => {
            // New Stripe accounts may default to Managed Payments, which rejects these options.
            if (params.managed_payments?.enabled !== false)
              throw new Error("Managed Payments rejects payment_method_types");
            fake.creates++;
            const session = {
              id: `cs_test_${randomUUID()}`,
              mode: "payment",
              customer: params.customer,
              metadata: params.metadata,
              client_reference_id: params.client_reference_id,
              status: "open",
              payment_status: "unpaid",
              currency: "eur",
              amount_total: params.automatic_tax?.enabled ? 61000 : 50000,
              amount_subtotal: 50000,
              automatic_tax: {
                enabled: !!params.automatic_tax?.enabled,
                status: "complete",
              },
              total_details: {
                amount_tax: params.automatic_tax?.enabled ? 11000 : 0,
                amount_discount: 0,
                amount_shipping: 0,
              },
              customer_details: {
                name: "Test Business",
                email: "billing@example.com",
                address: { country: "IT" },
              },
              livemode: false,
              url: "https://checkout.stripe.com/c/pay/test",
              expires_at: params.expires_at,
              line_items: {
                data: [
                  {
                    price: { id: "price_test", tax_behavior: "exclusive" },
                    quantity: 1,
                    amount_subtotal: 50000,
                    amount_total: params.automatic_tax?.enabled ? 61000 : 50000,
                    taxes: [],
                  },
                ],
              },
              payment_intent: null,
            } as unknown as Stripe.Checkout.Session;
            fake.sessions.set(session.id, session);
            return structuredClone(session);
          },
          retrieve: async (id: string) => {
            if (fake.failRetrieve) throw new Error("Network failed");
            return structuredClone(fake.sessions.get(id)!);
          },
          expire: async (id: string) => {
            const session = fake.sessions.get(id)!;
            session.status = "expired";
            return session;
          },
        },
      },
      events: {
        list: async function* () {
          for (const event of fake.events) yield event;
        },
      },
      disputes: { list: async () => ({ data: fake.disputes }) },
      webhooks: real.webhooks,
    }),
  };
});

const connection = process.env.SPONSOR_TEST_DATABASE_URL;
const schema = `sponsor_test_${randomUUID().replaceAll("-", "")}`;
let admin: Pool;
let png: Buffer;

describe.skipIf(!connection)(
  "sponsor purchases with isolated PostgreSQL and mocked Stripe",
  () => {
    beforeAll(async () => {
      admin = new Pool({ connectionString: connection });
      await admin.query(`CREATE SCHEMA ${schema}`);
      const url = new URL(connection!);
      url.searchParams.set("options", `-c search_path=${schema}`);
      vi.stubEnv("DATABASE_URL", url.toString());
      vi.stubEnv("SPONSOR_DATABASE_URL", url.toString());
      vi.stubEnv("STRIPE_PRIVATE_KEY", "sk_test_mock");
      vi.stubEnv("STRIPE_PRICE_ID", "price_test");
      vi.stubEnv("SPONSOR_SESSION_SECRET", "x".repeat(64));
      vi.stubEnv("SPONSOR_APP_URL", "http://localhost:5173");
      vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_mock");
      await database().query(
        await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
      );
      png = await sharp({
        create: { width: 16, height: 16, channels: 4, background: "cyan" },
      })
        .png()
        .toBuffer();
    });
    beforeEach(async () => {
      await database().query(
        "TRUNCATE sponsor_buyers, sponsor_purchases, sponsor_webhook_receipts, sponsor_analytics_outbox, sponsor_rate_limits CASCADE",
      );
      fake.sessions.clear();
      fake.customers.clear();
      fake.verification = "verified";
      fake.taxRegistered = true;
      fake.rejectTaxId = false;
      fake.events = [];
      fake.creates = 0;
      fake.failRetrieve = false;
      fake.analyticsLive = false;
      fake.disputes = [];
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });
    afterAll(async () => {
      await database().end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
      vi.unstubAllEnvs();
    });

    async function buyer() {
      const id = randomUUID();
      const token = randomBytes(32).toString("hex");
      await database().query(
        "INSERT INTO sponsor_buyers(id,token_hash) VALUES($1,$2)",
        [id, createHash("sha256").update(token).digest("hex")],
      );
      return { id, token };
    }
    function form(requestId: string = randomUUID()) {
      const data = new FormData();
      data.set("name", "Sponsor Test");
      data.set("url", "https://example.com");
      data.set("description", "A useful project for creators.");
      data.set(
        "icon",
        new File([new Uint8Array(png)], "icon.png", { type: "image/png" }),
      );
      data.set("requestId", requestId);
      data.set(
        "billing",
        JSON.stringify({
          ...billingDefaults,
          legalName: "Test Business",
          email: "billing@example.com",
          taxId: "IT12345678903",
          fiscalCode: "12345678903",
          line1: "Via Roma 1",
          city: "Firenze",
          postalCode: "50121",
          region: "FI",
          businessPurchase: true,
          termsAccepted: true,
          clausesAccepted: true,
        }),
      );
      return data;
    }
    async function order() {
      const owner = await buyer();
      const purchase = await reservePurchase(owner.id, form(), randomUUID());
      return { owner, purchase: await ensureCheckout(purchase.id, owner.id) };
    }
    function pay(sessionId: string, when = Math.floor(Date.now() / 1000)) {
      const session = fake.sessions.get(sessionId)!;
      const pi = {
        id: `pi_${randomUUID()}`,
        status: "succeeded",
        currency: "eur",
        amount_received: session.amount_total,
        created: when - 3600,
        latest_charge: { paid: true, amount_refunded: 0, disputed: false },
      } as Stripe.PaymentIntent;
      session.status = "complete";
      session.payment_status = "paid";
      session.payment_intent = pi;
      const event = {
        id: `evt_${randomUUID()}`,
        type: "payment_intent.succeeded",
        created: when,
        livemode: false,
        data: { object: { ...pi, metadata: session.metadata } },
      } as Stripe.Event;
      fake.events.push(event);
      return event;
    }
    function request(action: string, token: string, body: unknown = {}) {
      return new Request(
        `http://localhost:5173/api/sponsors?action=${action}`,
        {
          method: "POST",
          headers: {
            origin: "http://localhost:5173",
            "x-sponsor-client": "1",
            cookie: `unmarker_sponsor_session=${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
    }

    it("rejects missing billing data, consumer purchases and missing specific approval", async () => {
      for (const change of ["missing", "businessPurchase", "clausesAccepted"]) {
        const owner = await buyer();
        const data = form();
        if (change === "missing") data.delete("billing");
        else {
          const b = JSON.parse(String(data.get("billing")));
          b[change] = false;
          data.set("billing", JSON.stringify(b));
        }
        await expect(
          reservePurchase(owner.id, data, randomUUID()),
        ).rejects.toMatchObject({ code: "invalid_billing" });
      }
      expect(fake.creates).toBe(0);
    });
    it("requires an active Italian tax registration before creating Checkout", async () => {
      fake.taxRegistered = false;
      const owner = await buyer();
      const p = await reservePurchase(owner.id, form(), randomUUID());
      await expect(ensureCheckout(p.id, owner.id)).rejects.toMatchObject({
        code: "billing_unavailable",
      });
      expect(fake.creates).toBe(0);
      expect((await cancelPurchase(p.id, owner.id)).status).toBe("cancelled");
    });
    it("releases an unpaid reservation when Stripe rejects a tax ID", async () => {
      const owner = await buyer();
      const p = await reservePurchase(owner.id, form(), randomUUID());
      fake.rejectTaxId = true;
      await expect(ensureCheckout(p.id, owner.id)).rejects.toMatchObject({
        code: "tax_id_invalid",
        status: 422,
      });
      const { rows } = await database().query<{
        status: string;
        stripe_customer_id: string | null;
        stripe_session_id: string | null;
      }>(
        "SELECT status,stripe_customer_id,stripe_session_id FROM sponsor_purchases WHERE id=$1",
        [p.id],
      );
      expect(rows[0]).toEqual({
        status: "cancelled",
        stripe_customer_id: null,
        stripe_session_id: null,
      });
      fake.rejectTaxId = false;
      const replacement = await reservePurchase(owner.id, form(), randomUUID());
      expect((await ensureCheckout(replacement.id, owner.id)).status).toBe(
        "pending",
      );
    });
    it("waits for EU VAT verification before payment and supports a retry", async () => {
      const owner = await buyer();
      const data = form();
      const b = JSON.parse(String(data.get("billing")));
      Object.assign(b, {
        country: "DE",
        taxId: "DE123456789",
        fiscalCode: "",
        city: "Berlin",
        postalCode: "10115",
        region: "BE",
      });
      data.set("billing", JSON.stringify(b));
      const p = await reservePurchase(owner.id, data, randomUUID());
      fake.verification = "pending";
      await expect(ensureCheckout(p.id, owner.id)).rejects.toMatchObject({
        code: "tax_verification_pending",
      });
      expect(fake.creates).toBe(0);
      expect(fake.customers.size).toBe(1);
      fake.verification = "unverified";
      await expect(ensureCheckout(p.id, owner.id)).rejects.toMatchObject({
        code: "tax_verification_failed",
      });
      fake.verification = "verified";
      const checkout = await ensureCheckout(p.id, owner.id);
      expect(checkout.stripe_session_id).toBeTruthy();
      expect(fake.customers.size).toBe(1);
      expect(fake.creates).toBe(1);
    });
    it("stores a finalized tax and terms snapshot without exposing billing in the catalog", async () => {
      const { purchase } = await order();
      pay(purchase.stripe_session_id!);
      const active = await syncSponsorPurchase(purchase.id);
      expect(active.status).toBe("active");
      expect(active.billing_snapshot).toMatchObject({
        payment: { subtotal: 50000, tax: 11000, total: 61000 },
        termsVersion: "v1.0.0",
        specificallyApprovedClauses: [6, 7],
      });
      expect(active.terms_accepted_at).toBeInstanceOf(Date);
      const exposed = JSON.stringify(await catalog());
      expect(exposed).not.toContain("billing@example.com");
      expect(exposed).not.toContain("IT12345678903");
      fake.sessions.get(purchase.stripe_session_id!)!.customer_details!.name =
        "Later customer change";
      expect((await syncSponsorPurchase(purchase.id)).billing_snapshot).toEqual(
        active.billing_snapshot,
      );
    });
    it("rejects a paid Italian checkout with missing VAT even if the total matches its payment", async () => {
      const { purchase } = await order();
      const session = fake.sessions.get(purchase.stripe_session_id!)!;
      session.amount_total = 50000;
      session.total_details!.amount_tax = 0;
      session.line_items!.data[0].amount_total = 50000;
      pay(session.id);
      await expect(syncSponsorPurchase(purchase.id)).rejects.toMatchObject({
        code: "payment_mismatch",
      });
    });
    it("continues reconciling purchases created before fiscal data collection", async () => {
      const { owner, purchase } = await order();
      const session = fake.sessions.get(purchase.stripe_session_id!)!;
      await database().query(
        "UPDATE sponsor_buyers SET stripe_customer_id=$2 WHERE id=$1",
        [owner.id, session.customer],
      );
      await database().query(
        "UPDATE sponsor_purchases SET billing_details=NULL,stripe_customer_id=NULL,stripe_price_id=NULL,billing_snapshot=NULL WHERE id=$1",
        [purchase.id],
      );
      session.amount_total = 50000;
      session.automatic_tax.enabled = false;
      pay(session.id);
      expect((await syncSponsorPurchase(purchase.id)).status).toBe("active");
    });
    it("does not reuse a browser's billing identity for its next purchase", async () => {
      const { owner, purchase } = await order();
      pay(purchase.stripe_session_id!);
      await syncSponsorPurchase(purchase.id);
      const data = form();
      const b = JSON.parse(String(data.get("billing")));
      b.legalName = "Another business";
      data.set("billing", JSON.stringify(b));
      const second = await reservePurchase(owner.id, data, randomUUID());
      await ensureCheckout(second.id, owner.id);
      expect(fake.customers.size).toBe(2);
    });
    it("validates icon bytes, strips source metadata and rejects SVG", async () => {
      const icon = await normalizeIcon(png);
      expect((await sharp(icon).metadata()).format).toBe("webp");
      await expect(
        normalizeIcon(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
      ).rejects.toMatchObject({ code: "invalid_icon" });
    });
    it("reserves the last available places atomically under concurrent requests", async () => {
      const owners = await Promise.all(Array.from({ length: 20 }, buyer));
      const results = await Promise.allSettled(
        owners.map((owner) => reservePurchase(owner.id, form(), randomUUID())),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(17);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(3);
      expect((await catalog()).availableSpots).toBe(0);
    });
    it("reuses duplicate requests and rejects changed creative with the same idempotency key", async () => {
      const owner = await buyer();
      const requestId = randomUUID();
      const first = await reservePurchase(
        owner.id,
        form(requestId),
        randomUUID(),
      );
      const again = await reservePurchase(
        owner.id,
        form(requestId),
        randomUUID(),
      );
      expect(again.id).toBe(first.id);
      await ensureCheckout(first.id, owner.id);
      await ensureCheckout(first.id, owner.id);
      expect(fake.creates).toBe(1);
      const changed = form(requestId);
      changed.set("name", "Different sponsor");
      await expect(
        reservePurchase(owner.id, changed, randomUUID()),
      ).rejects.toMatchObject({ code: "request_changed" });
    });
    it.each([undefined, "false", "true"])(
      "persists the mobile label choice through payment and catalog (%s)",
      async (choice) => {
        const owner = await buyer();
        const data = form();
        if (choice !== undefined) data.set("mobileShowUrl", choice);
        const reserved = await reservePurchase(owner.id, data, randomUUID());
        expect(reserved.mobile_show_url).toBe(choice === "true");
        expect((await reservePurchase(owner.id, data, randomUUID())).id).toBe(
          reserved.id,
        );
        const changed = form(reserved.request_id);
        changed.set("mobileShowUrl", choice === "true" ? "false" : "true");
        await expect(
          reservePurchase(owner.id, changed, randomUUID()),
        ).rejects.toMatchObject({ code: "request_changed" });
        const checkout = await ensureCheckout(reserved.id, owner.id);
        pay(checkout.stripe_session_id!);
        await syncSponsorPurchase(checkout.id);
        expect((await catalog()).sponsors[0]).toMatchObject({
          id: reserved.id,
          mobileShowUrl: choice === "true",
        });
      },
    );
    it("rejects malformed mobile label preferences before reserving a slot", async () => {
      const owner = await buyer();
      const data = form();
      data.set("mobileShowUrl", "yes");
      await expect(
        reservePurchase(owner.id, data, randomUUID()),
      ).rejects.toMatchObject({ code: "invalid_form" });
    });
    async function analyticsOrder() {
      const owner = await buyer();
      const choice = createConsent(true, Date.now() - 1000);
      const data = form();
      data.set("analyticsId", "consenting-browser");
      data.set("analyticsConsent", JSON.stringify(choice));
      const purchase = await reservePurchase(owner.id, data, randomUUID());
      await ensureCheckout(purchase.id, owner.id);
      const ready = await database().query(
        "SELECT stripe_session_id FROM sponsor_purchases WHERE id=$1",
        [purchase.id],
      );
      await syncSponsorPurchase(
        purchase.id,
        pay(ready.rows[0].stripe_session_id),
      );
      vi.stubEnv("POSTHOG_API_KEY", "phc_mock");
      const send = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", send);
      fake.analyticsLive = true;
      return { owner, purchase, choice, send };
    }
    it("does not store attribution without explicit valid consent", async () => {
      const owner = await buyer();
      const data = form();
      data.set("analyticsId", "unconsented-id");
      const purchase = await reservePurchase(owner.id, data, randomUUID());
      expect(purchase.analytics_id).toBeNull();
      expect(purchase.analytics_consent_at).toBeNull();
    });
    it("delivers conversions only for a valid recorded consent", async () => {
      const { send } = await analyticsOrder();
      await flushAnalytics();
      await flushAnalytics();
      expect(send).toHaveBeenCalledTimes(2);
      expect(JSON.parse(send.mock.calls[0][1].body).properties).toMatchObject({
        distinct_id: "consenting-browser",
        consent_version: "2026-09-17",
      });
    });
    it("withdrawal stops pending and retried conversions without changing the campaign", async () => {
      const { owner, purchase, send } = await analyticsOrder();
      send.mockRejectedValueOnce(new Error("offline"));
      await expect(flushAnalytics()).rejects.toThrow("offline");
      await updateSponsorConsent(owner.id, createConsent(false));
      send.mockClear();
      await flushAnalytics();
      expect(send).not.toHaveBeenCalled();
      const stored = (
        await database().query("SELECT * FROM sponsor_purchases WHERE id=$1", [
          purchase.id,
        ])
      ).rows[0];
      expect(stored.status).toBe("active");
      expect(stored.analytics_id).toBeNull();
      expect(
        (
          await database().query(
            "SELECT * FROM sponsor_analytics_outbox WHERE delivered_at IS NULL",
          )
        ).rows,
      ).toHaveLength(0);
    });
    it("does not restore old attribution after stale or renewed acceptance", async () => {
      const { owner, choice, send } = await analyticsOrder();
      const denial = createConsent(false);
      await updateSponsorConsent(owner.id, denial);
      await updateSponsorConsent(owner.id, choice);
      expect(
        (
          await database().query(
            "SELECT analytics_consent FROM sponsor_buyers WHERE id=$1",
            [owner.id],
          )
        ).rows[0].analytics_consent.analytics,
      ).toBe(false);
      await updateSponsorConsent(
        owner.id,
        createConsent(true, denial.updatedAt + 1),
      );
      await flushAnalytics();
      expect(send).not.toHaveBeenCalled();
    });
    it("discards conversions after consent expires", async () => {
      const { owner, send } = await analyticsOrder();
      await database().query(
        "UPDATE sponsor_buyers SET analytics_consent=$2 WHERE id=$1",
        [owner.id, createConsent(true, Date.now() - 366 * 86400000)],
      );
      await flushAnalytics();
      expect(send).not.toHaveBeenCalled();
    });
    it("syncs consent without creating buyer cookies for ordinary visitors", async () => {
      const response = await handleSponsorRequest(
        new Request("http://localhost:5173/api/sponsors?action=consent", {
          method: "POST",
          headers: { origin: "http://localhost:5173", "x-sponsor-client": "1" },
          body: JSON.stringify(createConsent(false)),
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(
        (await database().query("SELECT * FROM sponsor_buyers")).rows,
      ).toHaveLength(0);
    });
    it("requires the buyer session and same origin for a server withdrawal", async () => {
      const { owner, send } = await analyticsOrder();
      const request = (origin: string) =>
        new Request("http://localhost:5173/api/sponsors?action=consent", {
          method: "POST",
          headers: {
            origin,
            "x-sponsor-client": "1",
            cookie: `unmarker_sponsor_session=${owner.token}`,
          },
          body: JSON.stringify(createConsent(false)),
        });
      expect(
        (await handleSponsorRequest(request("https://other.example"))).status,
      ).toBe(403);
      expect(
        (await handleSponsorRequest(request("http://localhost:5173"))).status,
      ).toBe(200);
      await flushAnalytics();
      expect(send).not.toHaveBeenCalled();
    });
    it("recovers a Stripe success whose database attachment was interrupted", async () => {
      const { owner, purchase } = await order();
      await database().query(
        "UPDATE sponsor_purchases SET stripe_session_id=NULL,status='creating' WHERE id=$1",
        [purchase.id],
      );
      const recovered = await ensureCheckout(purchase.id, owner.id);
      expect(recovered.stripe_session_id).toBe(purchase.stripe_session_id);
      expect(fake.creates).toBe(1);
    });
    it("does not publish an unpaid purchase or trust a success-page visit", async () => {
      const { purchase } = await order();
      expect((await syncSponsorPurchase(purchase.id)).status).toBe("pending");
      expect((await catalog()).sponsors).toHaveLength(0);
    });
    it("activates once from verified payment time and never extends on refresh or duplicate webhook", async () => {
      const { purchase } = await order();
      const event = pay(purchase.stripe_session_id!);
      const first = await syncSponsorPurchase(purchase.id, event);
      await processWebhook(event);
      await processWebhook(event);
      const again = await syncSponsorPurchase(purchase.id);
      expect(first.status).toBe("active");
      expect(again.starts_at).toEqual(first.starts_at);
      expect(first.starts_at!.getTime()).toBe(event.created * 1000);
      expect(first.expires_at!.getTime() - first.starts_at!.getTime()).toBe(
        30 * 86400000,
      );
      expect((await catalog()).sponsors).toHaveLength(1);
      expect(
        (await database().query("SELECT * FROM sponsor_analytics_outbox")).rows,
      ).toHaveLength(2);
      expect(
        (await database().query("SELECT * FROM sponsor_webhook_receipts")).rows,
      ).toHaveLength(1);
    });
    it("fulfills via webhook even when the customer never returns", async () => {
      const { purchase } = await order();
      const payment = pay(purchase.stripe_session_id!);
      const stripe = new Stripe("sk_test_mock");
      const body = JSON.stringify(payment);
      const signature = stripe.webhooks.generateTestHeaderString({
        payload: body,
        secret: "whsec_mock",
      });
      const response = await handleSponsorRequest(
        new Request("http://localhost:5173/api/sponsors?action=webhook", {
          method: "POST",
          headers: { "stripe-signature": signature },
          body,
        }),
      );
      expect(response.status).toBe(200);
      expect((await catalog()).sponsors).toHaveLength(1);
    });
    it("rejects an invalid webhook signature and retries an interrupted fulfillment", async () => {
      const { purchase } = await order();
      const event = pay(purchase.stripe_session_id!);
      expect(
        (
          await handleSponsorRequest(
            new Request("http://localhost:5173/api/sponsors?action=webhook", {
              method: "POST",
              body: JSON.stringify(event),
            }),
          )
        ).status,
      ).toBe(400);
      fake.failRetrieve = true;
      await expect(processWebhook(event)).rejects.toThrow();
      expect(
        (await database().query("SELECT * FROM sponsor_webhook_receipts")).rows,
      ).toHaveLength(0);
      fake.failRetrieve = false;
      fake.analyticsLive = false;
      await processWebhook(event);
      expect((await catalog()).sponsors).toHaveLength(1);
    });
    it("rejects cross-origin actions and another buyer's purchase reference", async () => {
      const { purchase } = await order();
      const intruder = await buyer();
      const unauthorized = await handleSponsorRequest(
        request("status", intruder.token, { id: purchase.id }),
      );
      expect(unauthorized.status).toBe(404);
      const crossOrigin = request("session", intruder.token);
      crossOrigin.headers.set("origin", "https://evil.example");
      expect((await handleSponsorRequest(crossOrigin)).status).toBe(403);
    });
    it("verifies amount and price before fulfillment", async () => {
      const { purchase } = await order();
      pay(purchase.stripe_session_id!);
      fake.sessions.get(purchase.stripe_session_id!)!.amount_total = 1;
      await expect(syncSponsorPurchase(purchase.id)).rejects.toMatchObject({
        code: "payment_mismatch",
      });
      expect((await catalog()).sponsors).toHaveLength(0);
    });
    it("releases capacity only after Stripe confirms cancellation", async () => {
      const { owner, purchase } = await order();
      expect((await catalog()).availableSpots).toBe(16);
      expect((await cancelPurchase(purchase.id, owner.id)).status).toBe(
        "cancelled",
      );
      expect((await catalog()).availableSpots).toBe(17);
    });
    it("stops publication without Stripe access and keeps it stopped through retries and reconciliation", async () => {
      const { owner, purchase } = await order();
      const event = pay(purchase.stripe_session_id!);
      const paid = await syncSponsorPurchase(purchase.id);
      // The public checkout cancellation action does not stop a paid campaign.
      expect(
        (await cancelPurchase(purchase.id, owner.id)).publication_stopped_at,
      ).toBeNull();
      fake.failRetrieve = true;
      const stopped = await stopSponsorPublication({
        id: purchase.id,
        operator: "admin",
        reference: "request-001",
      });
      expect(stopped.status).toBe("active"); // Payment state is retained separately.
      expect(stopped.publication_stopped_at).toBeInstanceOf(Date);
      expect(stopped.starts_at).toEqual(paid.starts_at);
      expect(stopped.expires_at).toEqual(paid.expires_at);
      expect(stopped.billing_snapshot).toEqual(paid.billing_snapshot);
      expect((await catalog()).sponsors).toHaveLength(0);
      expect((await catalog()).availableSpots).toBe(17);
      const repeated = await stopSponsorPublication({
        id: purchase.id,
        operator: "another-admin",
        reference: "retry",
      });
      expect(repeated.publication_stopped_at).toEqual(
        stopped.publication_stopped_at,
      );
      expect(repeated.publication_stopped_by).toBe("admin");
      expect(repeated.publication_stop_reference).toBe("request-001");
      fake.failRetrieve = false;
      await processWebhook(event);
      await reconcilePurchases();
      const after = await syncSponsorPurchase(purchase.id);
      expect(publicPurchase(after)).toMatchObject({
        status: "stopped",
        stoppedAt: stopped.publication_stopped_at!.toISOString(),
      });
      expect(JSON.stringify(publicPurchase(after))).not.toContain(
        "request-001",
      );
      expect((await catalog()).sponsors).toHaveLength(0);
      expect((await catalog()).availableSpots).toBe(17);
      const icon = await handleSponsorRequest(
        new Request(
          `http://localhost:5173/api/sponsors?action=icon&id=${purchase.id}`,
        ),
      );
      expect(icon.status).toBe(404);
      expect(
        (
          await handleSponsorRequest(
            request("stop", owner.token, { id: purchase.id }),
          )
        ).status,
      ).toBe(404);
    });
    it("preserves a stop across partial/full refunds and a won dispute", async () => {
      const { purchase } = await order();
      pay(purchase.stripe_session_id!);
      const paid = await syncSponsorPurchase(purchase.id);
      await stopSponsorPublication({
        id: purchase.id,
        operator: "admin",
        reference: "request-002",
      });
      const pi = fake.sessions.get(purchase.stripe_session_id!)!
        .payment_intent as Stripe.PaymentIntent;
      const charge = pi.latest_charge as Stripe.Charge;
      charge.amount_refunded = 5000;
      charge.disputed = true;
      fake.disputes = [{ status: "needs_response" } as Stripe.Dispute];
      expect((await syncSponsorPurchase(purchase.id)).status).toBe("disputed");
      expect((await catalog()).availableSpots).toBe(17);
      fake.disputes = [{ status: "won" } as Stripe.Dispute];
      const won = await syncSponsorPurchase(purchase.id);
      expect(publicPurchase(won).status).toBe("stopped");
      expect(won.expires_at).toEqual(paid.expires_at);
      charge.amount_refunded = 61000;
      const refunded = await syncSponsorPurchase(purchase.id);
      expect(refunded.status).toBe("refunded");
      expect(refunded.publication_stopped_at).toEqual(
        won.publication_stopped_at,
      );
      expect((await catalog()).sponsors).toHaveLength(0);
    });
    it("serializes a stop with payment synchronization and rejects unpaid/expired campaigns", async () => {
      const { purchase } = await order();
      const input = {
        id: purchase.id,
        operator: "admin",
        reference: "request-003",
      };
      await expect(stopSponsorPublication(input)).rejects.toMatchObject({
        code: "campaign_not_running",
      });
      await expect(
        stopSponsorPublication({ ...input, operator: " " }),
      ).rejects.toThrow();
      const event = pay(purchase.stripe_session_id!);
      await syncSponsorPurchase(purchase.id);
      await Promise.all([
        processWebhook(event),
        stopSponsorPublication(input),
        syncSponsorPurchase(purchase.id),
      ]);
      expect(
        publicPurchase(await syncSponsorPurchase(purchase.id)).status,
      ).toBe("stopped");
      expect((await catalog()).sponsors).toHaveLength(0);
      const expired = await order();
      pay(
        expired.purchase.stripe_session_id!,
        Math.floor(Date.now() / 1000) - 31 * 86400,
      );
      await syncSponsorPurchase(expired.purchase.id);
      await expect(
        stopSponsorPublication({ ...input, id: expired.purchase.id }),
      ).rejects.toMatchObject({ code: "campaign_not_running" });
    });
    it("prepares manual confirmation from the accepted snapshot and checks its integrity", async () => {
      const { purchase } = await order();
      expect(() => purchaseConfirmation(purchase)).toThrow(
        "No confirmed payment",
      );
      pay(purchase.stripe_session_id!);
      const paid = await syncSponsorPurchase(purchase.id);
      const confirmation = purchaseConfirmation(paid);
      const terms = paid.billing_snapshot!.terms as {
        text: string;
        sha256: string;
      };
      expect(confirmation.recipient).toBe("billing@example.com");
      expect(confirmation.terms).toBe(terms.text);
      expect(confirmation.body).toContain("610,00");
      expect(confirmation.body).toContain(paid.starts_at!.toISOString());
      expect(confirmation.body).toContain(paid.expires_at!.toISOString());
      expect(purchaseConfirmation(paid, "en").body).toContain(
        "no automatic renewal",
      );
      expect(confirmation.body).not.toContain(paid.stripe_payment_intent_id);
      const modified = structuredClone(paid);
      modified.billing_snapshot!.terms = { ...terms, text: "different terms" };
      expect(() => purchaseConfirmation(modified)).toThrow(
        "Purchase evidence mismatch",
      );
    });
    it("uses current Stripe state for out-of-order events, including refunds", async () => {
      const { purchase } = await order();
      const event = pay(purchase.stripe_session_id!);
      await processWebhook(event);
      const session = fake.sessions.get(purchase.stripe_session_id!)!;
      const pi = session.payment_intent as Stripe.PaymentIntent;
      (pi.latest_charge as Stripe.Charge).amount_refunded = 61000;
      await processWebhook({
        ...event,
        id: "evt_late_checkout",
        type: "checkout.session.completed",
        data: { object: session },
      } as Stripe.Event);
      expect((await syncSponsorPurchase(purchase.id)).status).toBe("refunded");
      expect((await catalog()).sponsors).toHaveLength(0);
    });
    it.each([1, 5000, 50000, 60999])(
      "keeps a campaign and its slot after a partial refund of %i cents",
      async (amountRefunded) => {
        const { purchase } = await order();
        const payment = pay(purchase.stripe_session_id!);
        await processWebhook(payment);
        const before = await syncSponsorPurchase(purchase.id);
        const session = fake.sessions.get(purchase.stripe_session_id!)!;
        const pi = session.payment_intent as Stripe.PaymentIntent;
        const charge = pi.latest_charge as Stripe.Charge;
        charge.amount_refunded = amountRefunded;
        const refund = {
          ...payment,
          id: `evt_refund_${randomUUID()}`,
          type: "charge.refunded",
          data: { object: { ...charge, payment_intent: pi.id } },
        } as Stripe.Event;

        // Exercise the signed webhook entry point, including duplicate delivery.
        const stripe = new Stripe("sk_test_mock");
        const body = JSON.stringify(refund);
        const signature = stripe.webhooks.generateTestHeaderString({
          payload: body,
          secret: "whsec_mock",
        });
        for (let delivery = 0; delivery < 2; delivery++) {
          const response = await handleSponsorRequest(
            new Request("http://localhost:5173/api/sponsors?action=webhook", {
              method: "POST",
              headers: { "stripe-signature": signature },
              body,
            }),
          );
          expect(response.status).toBe(200);
        }
        expect(await reconcilePurchases()).toEqual({ synced: 1, failures: [] });
        const after = await syncSponsorPurchase(purchase.id);
        expect(after.status).toBe("active");
        expect(after.starts_at).toEqual(before.starts_at);
        expect(after.expires_at).toEqual(before.expires_at);
        const listing = await catalog();
        expect(listing.sponsors.map((s) => s.id)).toEqual([purchase.id]);
        expect(listing.availableSpots).toBe(16);
        expect(
          (
            await database().query(
              "SELECT * FROM sponsor_analytics_outbox WHERE purchase_id=$1",
              [purchase.id],
            )
          ).rowCount,
        ).toBe(2);
        expect(
          (
            await database().query(
              "SELECT * FROM sponsor_webhook_receipts WHERE id=$1",
              [refund.id],
            )
          ).rowCount,
        ).toBe(1);
      },
    );
    it("removes a campaign when cumulative partial refunds reach the full payment despite stale events", async () => {
      const { purchase } = await order();
      const payment = pay(purchase.stripe_session_id!);
      await processWebhook(payment);
      const before = await syncSponsorPurchase(purchase.id);
      const session = fake.sessions.get(purchase.stripe_session_id!)!;
      const pi = session.payment_intent as Stripe.PaymentIntent;
      const charge = pi.latest_charge as Stripe.Charge;
      charge.amount_refunded = 25000;
      const partialEvent = {
        ...payment,
        id: "evt_partial_refund",
        type: "charge.refunded",
        data: { object: { ...charge, payment_intent: pi.id } },
      } as Stripe.Event;
      await processWebhook(partialEvent);
      expect((await syncSponsorPurchase(purchase.id)).status).toBe("active");

      charge.amount_refunded = 61000;
      // A missed full-refund webhook is recovered by reconciliation.
      expect(await reconcilePurchases()).toEqual({ synced: 1, failures: [] });
      await processWebhook(partialEvent);
      await processWebhook({
        ...partialEvent,
        id: "evt_delayed_partial_refund",
      });
      const after = await syncSponsorPurchase(purchase.id);
      expect(after.status).toBe("refunded");
      expect(after.starts_at).toEqual(before.starts_at);
      expect(after.expires_at).toEqual(before.expires_at);
      expect((await catalog()).sponsors).toHaveLength(0);
      expect((await catalog()).availableSpots).toBe(17);
    });
    it("does not reactivate or extend an expired campaign after a partial refund", async () => {
      const { purchase } = await order();
      const payment = pay(
        purchase.stripe_session_id!,
        Math.floor(Date.now() / 1000) - 31 * 86400,
      );
      await processWebhook(payment);
      const before = await syncSponsorPurchase(purchase.id);
      const pi = fake.sessions.get(purchase.stripe_session_id!)!
        .payment_intent as Stripe.PaymentIntent;
      (pi.latest_charge as Stripe.Charge).amount_refunded = 5000;
      const after = await syncSponsorPurchase(purchase.id);
      expect(after.status).toBe("expired");
      expect(after.starts_at).toEqual(before.starts_at);
      expect(after.expires_at).toEqual(before.expires_at);
      expect((await catalog()).sponsors).toHaveLength(0);
      expect((await catalog()).availableSpots).toBe(17);
    });
    it("keeps a disputed slot reserved so winning the dispute cannot oversell inventory", async () => {
      const { purchase } = await order();
      const event = pay(purchase.stripe_session_id!);
      await processWebhook(event);
      const session = fake.sessions.get(purchase.stripe_session_id!)!;
      const pi = session.payment_intent as Stripe.PaymentIntent;
      // A partial compensation must neither bypass an open dispute nor prevent restoration.
      (pi.latest_charge as Stripe.Charge).amount_refunded = 5000;
      (pi.latest_charge as Stripe.Charge).disputed = true;
      fake.disputes = [{ status: "needs_response" } as Stripe.Dispute];
      expect((await syncSponsorPurchase(purchase.id)).status).toBe("disputed");
      expect((await catalog()).sponsors).toHaveLength(0);
      expect((await catalog()).availableSpots).toBe(16);
      fake.disputes = [{ status: "won" } as Stripe.Dispute];
      const restored = await syncSponsorPurchase(purchase.id);
      expect(restored.status).toBe("active");
      expect(restored.starts_at!.getTime()).toBe(event.created * 1000);
      expect(restored.expires_at!.getTime()).toBe(
        (event.created + 30 * 86400) * 1000,
      );
      expect((await catalog()).availableSpots).toBe(16);
    });
    it("returns a safe JSON error if session creation loses its database connection", async () => {
      const connect = vi
        .spyOn(database(), "connect")
        .mockRejectedValueOnce(new Error("Database unavailable"));
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const response = await handleSponsorRequest(
          new Request("http://localhost:5173/api/sponsors?action=session", {
            method: "POST",
            headers: {
              origin: "http://localhost:5173",
              "x-sponsor-client": "1",
            },
          }),
        );
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "temporary_error" });
      } finally {
        connect.mockRestore();
        log.mockRestore();
      }
    });
    it("uses exactly 720 hours across daylight-saving changes and hides expired campaigns", async () => {
      const { purchase } = await order();
      await database().query("SET timezone='Europe/Rome'");
      const when = Date.parse("2026-03-20T12:00:00Z") / 1000;
      const event = pay(purchase.stripe_session_id!, when);
      const result = await syncSponsorPurchase(purchase.id, event);
      expect(result.expires_at!.toISOString()).toBe("2026-04-19T12:00:00.000Z");
      expect((await catalog()).sponsors).toHaveLength(0);
    });
  },
);
