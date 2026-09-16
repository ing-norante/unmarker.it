import { readFile, writeFile } from "node:fs/promises";
import Stripe from "stripe";

const key = process.env.STRIPE_PRIVATE_KEY;
if (!key?.startsWith("sk_test_"))
  throw new Error("This setup command only accepts Stripe test keys.");
const stripe = new Stripe(key);
const expectedAccount = process.env.STRIPE_ACCOUNT_ID;
if (!expectedAccount)
  throw new Error("STRIPE_ACCOUNT_ID must identify the intended test account or sandbox.");
const account = await stripe.accounts.retrieveCurrent();
if (account.id !== expectedAccount)
  throw new Error("Unexpected Stripe account.");
let product: Stripe.Product | undefined;
for await (const candidate of stripe.products.list({
  active: true,
  limit: 100,
})) {
  if (candidate.metadata.unmarker_product === "sponsor_30_days") {
    product = candidate;
    break;
  }
}
product ??= await stripe.products.create(
  {
    name: "Unmarker.it — 30-day sponsorship",
    description:
      "One sponsor placement for 30 days from confirmed payment. One payment, no automatic renewal.",
    metadata: { unmarker_product: "sponsor_30_days" },
  },
  { idempotencyKey: "unmarker-sponsor-product-v1" },
);
const prices = await stripe.prices.list({
  product: product.id,
  active: true,
  type: "one_time",
  limit: 100,
});
let price = prices.data.find(
  (p) => p.currency === "eur" && p.unit_amount === 50000,
);
price ??= await stripe.prices.create(
  {
    product: product.id,
    currency: "eur",
    unit_amount: 50000,
    metadata: { unmarker_duration_days: "30" },
  },
  { idempotencyKey: "unmarker-sponsor-price-eur500-v1" },
);
let env = await readFile(".env", "utf8");
env = /^STRIPE_PRICE_ID=/m.test(env)
  ? env.replace(/^STRIPE_PRICE_ID=.*$/m, `STRIPE_PRICE_ID=${price.id}`)
  : `${env}\nSTRIPE_PRICE_ID=${price.id}\n`;
await writeFile(".env", env, { mode: 0o600 });
console.log(
  JSON.stringify({
    account: account.id,
    product: product.id,
    price: price.id,
    amount: price.unit_amount,
    currency: price.currency,
    livemode: price.livemode,
  }),
);
