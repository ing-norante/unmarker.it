import type Stripe from "stripe";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  EU_COUNTRIES,
  SPONSOR_TAX_CODE,
  SPONSOR_TERMS_PUBLISHED,
  type SponsorBilling,
} from "../../src/lib/sponsorBilling.ts";
import { getStripe, getConfig, SponsorError } from "./config.ts";

export function assertLiveBillingReady(country?: string) {
  if (!getConfig().live) return;
  const countries = (process.env.SPONSOR_APPROVED_BILLING_COUNTRIES || "")
    .split(",")
    .map((country) => country.trim().toUpperCase());
  if (!SPONSOR_TERMS_PUBLISHED || (country && !countries.includes(country)))
    throw new SponsorError("billing_unavailable", 503);
}

export async function assertTaxConfiguration(price: Stripe.Price) {
  const stripe = getStripe();
  const [settings, registrations, product] = await Promise.all([
    stripe.tax.settings.retrieve(),
    stripe.tax.registrations.list({ status: "active", limit: 100 }),
    stripe.products.retrieve(
      typeof price.product === "string" ? price.product : price.product.id,
    ),
  ]);
  if (
    price.tax_behavior !== "exclusive" ||
    product.deleted ||
    product.tax_code !== SPONSOR_TAX_CODE ||
    settings.status !== "active" ||
    settings.head_office?.address?.country !== "IT" ||
    !registrations.data.some((r) => r.country === "IT")
  )
    throw new SponsorError("billing_unavailable", 503);
}

export function stripeCustomerData(
  b: SponsorBilling,
): Stripe.CustomerCreateParams {
  return {
    name: b.legalName,
    email: b.email,
    address: {
      country: b.country,
      line1: b.line1,
      city: b.city,
      postal_code: b.postalCode || undefined,
      state: b.region || undefined,
    },
    tax_id_data: [
      {
        type: b.taxIdType as Stripe.CustomerCreateParams.TaxIdDatum.Type,
        value: b.taxId,
      },
    ],
  };
}

export async function verifyBusinessTaxId(customer: string, b: SponsorBilling) {
  // Cross-border EU tax relief must not rely on Checkout's format-only check.
  // Domestic IT is taxed even when its VAT ID is not enrolled in VIES.
  const ids = await getStripe().customers.listTaxIds(customer, { limit: 100 });
  const expected = b.taxIdType;
  const id = ids.data.find(
    (x) =>
      x.type === expected &&
      x.value.replace(/\s/g, "").toUpperCase() === b.taxId,
  );
  if (!id) throw new SponsorError("invalid_billing");
  if (EU_COUNTRIES.has(b.country) && b.country !== "IT") {
    if (id.verification?.status === "pending")
      throw new SponsorError("tax_verification_pending", 409);
    if (id.verification?.status !== "verified")
      throw new SponsorError("tax_verification_failed", 409);
  }
  return {
    type: id.type,
    value: id.value,
    status: id.verification?.status ?? "unavailable",
    verifiedName: id.verification?.verified_name ?? null,
    verifiedAddress: id.verification?.verified_address ?? null,
    checkedAt: new Date().toISOString(),
  };
}

export async function termsEvidence() {
  const text = await readFile(
    resolve("docs/legal/sponsor-terms.en.md"),
    "utf8",
  );
  return { sha256: createHash("sha256").update(text).digest("hex"), text };
}

export function validateTaxedSession(
  session: Stripe.Checkout.Session,
  billing: SponsorBilling,
) {
  const item = session.line_items?.data[0];
  const tax = session.total_details?.amount_tax;
  if (
    session.automatic_tax?.enabled !== true ||
    session.automatic_tax.status !== "complete" ||
    session.amount_subtotal !== 50000 ||
    !Number.isSafeInteger(tax) ||
    tax! < 0 ||
    session.total_details?.amount_discount !== 0 ||
    session.total_details?.amount_shipping !== 0 ||
    session.amount_total !== 50000 + tax! ||
    item?.amount_subtotal !== 50000 ||
    item?.amount_total !== session.amount_total ||
    item?.price?.tax_behavior !== "exclusive"
  )
    throw new SponsorError("payment_mismatch", 409);
  // Detect a missing/incorrect domestic registration or unexpected customer exemption.
  if (billing.country === "IT" && tax !== 11000)
    throw new SponsorError("payment_mismatch", 409);
  return {
    currency: session.currency,
    subtotal: session.amount_subtotal,
    tax,
    total: session.amount_total,
    taxBreakdown: item.taxes ?? [],
    customerDetails: session.customer_details,
  };
}
