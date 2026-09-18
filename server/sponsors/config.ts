import Stripe from "stripe";

export class SponsorError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function getConfig() {
  const {
    STRIPE_PRIVATE_KEY: key,
    STRIPE_PRICE_ID: priceId,
    SPONSOR_SESSION_SECRET: secret,
    STRIPE_WEBHOOK_SECRET: webhookSecret,
  } = process.env;
  // A dedicated connection can isolate sponsor previews from Marketplace-managed defaults.
  const databaseUrl =
    process.env.SPONSOR_DATABASE_URL || process.env.DATABASE_URL;
  if (!key || !priceId || !databaseUrl || !secret || secret.length < 32)
    throw new SponsorError("unavailable", 503);
  // Restricted backend keys use rk_; they must obey the same live-mode guard.
  const live = /^(?:sk|rk)_live_/.test(key);
  if (!/^(?:sk|rk)_test_/.test(key) && !live)
    throw new SponsorError("unavailable", 503);
  if (live && process.env.SPONSOR_ALLOW_LIVE_PAYMENTS !== "true")
    throw new SponsorError("unavailable", 503);
  const origin = new URL(process.env.SPONSOR_APP_URL || "http://localhost:5173")
    .origin;
  if (
    (live || process.env.VERCEL) &&
    (!origin.startsWith("https://") || !webhookSecret)
  )
    throw new SponsorError("unavailable", 503);
  return { key, priceId, databaseUrl, secret, webhookSecret, origin, live };
}

let client: Stripe | undefined;
export function getStripe() {
  // The exact SDK version is pinned in package.json; its matching API version is used.
  client ??= new Stripe(getConfig().key, {
    maxNetworkRetries: 2,
    timeout: 12_000,
  });
  return client;
}
