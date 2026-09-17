import { createHash } from "node:crypto";
import { z } from "zod";
import type { Purchase } from "./service.ts";

const evidenceSchema = z.object({
  terms: z.object({ text: z.string().min(1), sha256: z.string() }),
  termsVersion: z.string().min(1),
  payment: z.object({
    currency: z.literal("eur"),
    subtotal: z.number().int().nonnegative(),
    tax: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

// Produces a local draft only. Never send the billing export itself to a customer:
// it includes internal accounting and payment data unnecessary for confirmation.
export function purchaseConfirmation(
  p: Purchase,
  language: "it" | "en" = "it",
) {
  if (!p.billing_details || !p.starts_at || !p.expires_at || !p.paid_event_id)
    throw Error("No confirmed payment. Reconcile the purchase first.");
  const evidence = evidenceSchema.parse(p.billing_snapshot);
  const hash = createHash("sha256").update(evidence.terms.text).digest("hex");
  if (
    hash !== evidence.terms.sha256 ||
    evidence.termsVersion !== p.billing_details.termsVersion ||
    evidence.payment.subtotal + evidence.payment.tax !== evidence.payment.total
  )
    throw Error("Purchase evidence mismatch. Do not send this confirmation.");
  const money = (cents: number) =>
    new Intl.NumberFormat(language, {
      style: "currency",
      currency: "EUR",
    }).format(cents / 100);
  const date = (value: Date) => `${value.toISOString()} (UTC)`;
  const { subtotal, tax, total } = evidence.payment;
  const body =
    language === "it"
      ? `Oggetto: Conferma acquisto sponsorizzazione Unmarker.it — ${p.id}

Gentile ${p.billing_details.legalName},

confermiamo il pagamento per la sponsorizzazione su Unmarker.it.

Riferimento acquisto: ${p.id}
Sponsor: ${p.name}
Sito promosso: ${p.url}
Descrizione: ${p.description}
Periodo acquistato: dal ${date(p.starts_at)} al ${date(p.expires_at)}
Durata: 30 giorni consecutivi (720 ore), dal pagamento confermato.
Pagamento unico, senza rinnovo o addebiti automatici.

Imponibile: ${money(subtotal)}
IVA applicata: ${money(tax)}
Totale pagato: ${money(total)}
Metodo di pagamento: carta tramite Stripe.
${p.publication_stopped_at ? `\nPubblicazione cessata anticipatamente il ${date(p.publication_stopped_at)}.\n` : ""}
In allegato trovi le condizioni di vendita accettate al momento dell'acquisto
(versione ${evidence.termsVersion}). Puoi conservarle insieme a questa email.
La cancellazione volontaria e i rimborsi per disservizi sono disciplinati dagli
articoli 6 e 7, fatti salvi i diritti inderogabili applicabili.

Questa conferma non è una fattura fiscale. La fatturazione è gestita separatamente.
Per assistenza rispondi a questa email indicando il riferimento dell'acquisto.

NoMaDe — NOMADE - S.R.L.
Via Luigi Salvatore Cherubini 10, 50121 Firenze (FI), Italia
P. IVA / C.F. 07505480488
help@nomadesrl.it
`
      : `Subject: Unmarker.it sponsorship purchase confirmation — ${p.id}

Dear ${p.billing_details.legalName},

We confirm receipt of your payment for sponsorship on Unmarker.it.

Purchase reference: ${p.id}
Sponsor: ${p.name}
Promoted website: ${p.url}
Description: ${p.description}
Purchased period: ${date(p.starts_at)} to ${date(p.expires_at)}
Duration: 30 consecutive days (720 hours), starting at confirmed payment.
One payment, with no automatic renewal or further automatic charges.

Subtotal: ${money(subtotal)}
Applicable VAT: ${money(tax)}
Total paid: ${money(total)}
Payment method: card via Stripe.
${p.publication_stopped_at ? `\nPublication ended early on ${date(p.publication_stopped_at)}.\n` : ""}
Attached are the sales terms you accepted when purchasing (Italian text,
version ${evidence.termsVersion}). Please keep them with this email.
Clauses 6 and 7 cover voluntary cancellation and downtime refunds, without
excluding applicable mandatory rights.

This confirmation is not a tax invoice. Invoicing is handled separately.
For assistance, reply to this email with your purchase reference.

NoMaDe — NOMADE - S.R.L.
Via Luigi Salvatore Cherubini 10, 50121 Firenze (FI), Italy
VAT / Tax ID 07505480488
help@nomadesrl.it
`;
  return {
    recipient: p.billing_details.email,
    body,
    terms: evidence.terms.text,
  };
}
