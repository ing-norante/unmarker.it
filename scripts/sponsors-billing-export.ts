import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { database } from "../server/sponsors/db.ts";
import { getConfig, getStripe } from "../server/sponsors/config.ts";
import type { Purchase } from "../server/sponsors/service.ts";

// Run as an administrator with the intended database credentials. No public export endpoint.
const id = z.uuid().parse(process.argv[2]);
const output = process.argv[3];
if (!output || !output.endsWith(".json"))
  throw Error(
    "Usage: sponsors-billing-export.ts <purchase UUID> <private output.json>",
  );
try {
  const { rows } = await database().query<Purchase>(
    "SELECT * FROM sponsor_purchases WHERE id=$1",
    [id],
  );
  const p = rows[0];
  if (
    !p?.billing_details ||
    !p.billing_snapshot?.payment ||
    !p.stripe_payment_intent_id
  )
    throw Error("No finalized billing snapshot. Reconcile the payment first.");
  const payment = await getStripe().paymentIntents.retrieve(
    p.stripe_payment_intent_id,
    { expand: ["latest_charge"] },
  );
  if (payment.livemode !== getConfig().live)
    throw Error("Payment environment mismatch");
  const charge =
    typeof payment.latest_charge === "object" ? payment.latest_charge : null;
  const payload = {
    documentType: "billing_source_data_not_a_tax_invoice",
    exportedAt: new Date().toISOString(),
    purchaseId: id,
    stripeSessionId: p.stripe_session_id,
    stripePaymentIntentId: p.stripe_payment_intent_id,
    stripeCustomerId: p.stripe_customer_id,
    testMode: !payment.livemode,
    billing: p.billing_details,
    acceptedAt: p.terms_accepted_at,
    evidence: p.billing_snapshot,
    campaign: {
      name: p.name,
      startsAt: p.starts_at,
      expiresAt: p.expires_at,
      status: p.status,
    },
    payment: {
      paidCents: payment.amount_received,
      refundedCents: charge?.amount_refunded ?? 0,
      disputed: charge?.disputed ?? false,
    },
    invoicing: {
      section: "_info",
      number: null,
      paymentMethod: "MP08",
      recipientCode:
        p.billing_details.country === "IT"
          ? p.billing_details.recipientCode || "0000000"
          : "XXXXXXX",
      instructions:
        "Check the current Fatture in Cloud sequence before assigning a number. This export is source data, not an XML invoice or an SdI submission. Review foreign VAT/nature and any stamp duty with the accountant. Record credit notes separately.",
    },
  };
  // Exclusive creation prevents accidental overwriting of an existing accounting export.
  await writeFile(output, JSON.stringify(payload, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  console.log(
    `Private billing source data saved to ${resolve(output)}. No invoice number assigned or document sent.`,
  );
} finally {
  await database().end();
}
