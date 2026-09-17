import { z } from "zod";
import { sponsorTaxIdTypes } from "./sponsorTaxIds.ts";

// Approved text; live sales stay gated until the publication/operational checklist is closed.
export const SPONSOR_TERMS_VERSION = "v1.0.0";
export const SPONSOR_TERMS_PUBLISHED: boolean = false;
export const SPONSOR_TAX_CODE = "txcd_10701000";
export const EU_COUNTRIES = new Set(
  "AT BE BG HR CY CZ DE DK EE ES FI FR GR HU IE IT LT LU LV MT NL PL PT RO SE SI SK".split(
    " ",
  ),
);
export function sponsorTaxTypesForCountry(country: string) {
  const types =
    sponsorTaxIdTypes[country as keyof typeof sponsorTaxIdTypes] ?? [];
  // EU business checkout requires VAT, not a personal/domestic tax identifier.
  return types.filter(
    (type) => !EU_COUNTRIES.has(country) || type.type === "eu_vat",
  );
}
export const billingDefaults = {
  legalName: "",
  country: "IT",
  taxIdType: "eu_vat",
  taxId: "",
  fiscalCode: "",
  email: "",
  line1: "",
  city: "",
  postalCode: "",
  region: "",
  recipientCode: "",
  pec: "",
  businessPurchase: false,
  termsAccepted: false,
  clausesAccepted: false,
  termsVersion: SPONSOR_TERMS_VERSION,
};

export function validItalianVat(value: string) {
  const number = value.replace(/^IT/, "");
  if (!/^\d{11}$/.test(number) || /^0+$/.test(number)) return false;
  let total = 0;
  for (let i = 0; i < 10; i++) {
    const digit = Number(number[i]) * (i % 2 ? 2 : 1);
    total += digit > 9 ? digit - 9 : digit;
  }
  return (10 - (total % 10)) % 10 === Number(number[10]);
}
const text = (max: number) => z.string().trim().min(1).max(max);
export const sponsorBillingSchema = z
  .object({
    legalName: text(200),
    country: text(2).toUpperCase(),
    taxIdType: text(30),
    taxId: text(100).transform((v) => v.replace(/\s/g, "").toUpperCase()),
    fiscalCode: z.string().trim().max(16).toUpperCase(),
    email: z.email().max(254),
    line1: text(200),
    city: text(100),
    postalCode: z.string().trim().max(20),
    region: z.string().trim().max(100).toUpperCase(),
    recipientCode: z.string().trim().max(7).toUpperCase(),
    pec: z.union([z.literal(""), z.email().max(254)]),
    businessPurchase: z.literal(true),
    termsAccepted: z.literal(true),
    clausesAccepted: z.literal(true),
    termsVersion: z.literal(SPONSOR_TERMS_VERSION),
  })
  .superRefine((v, ctx) => {
    const issue = (path: keyof typeof billingDefaults) =>
      ctx.addIssue({
        code: "custom",
        path: [path],
        message: "invalid_billing",
      });
    if (!(v.country in sponsorTaxIdTypes) || ["EU", "IC"].includes(v.country))
      issue("country");
    else if (
      !sponsorTaxTypesForCountry(v.country).some((t) => t.type === v.taxIdType)
    )
      issue("taxIdType");
    if (v.country === "IT") {
      if (!validItalianVat(v.taxId)) issue("taxId");
      if (!(
        validItalianVat(v.fiscalCode) ||
        /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(
          v.fiscalCode,
        )
      ))
        issue("fiscalCode");
      if (!/^\d{5}$/.test(v.postalCode)) issue("postalCode");
      if (!/^[A-Z]{2}$/.test(v.region)) issue("region");
      if (v.recipientCode && !/^[A-Z0-9]{7}$/.test(v.recipientCode))
        issue("recipientCode");
      // No routing code is legitimate: use 0000000 in the eventual SdI export.
      if (v.recipientCode === "XXXXXXX") issue("recipientCode");
    }
    if (["US", "CA"].includes(v.country)) {
      if (!v.postalCode) issue("postalCode");
      if (!v.region) issue("region");
    }
    if (EU_COUNTRIES.has(v.country)) {
      const prefix = v.country === "GR" ? "EL" : v.country;
      if (!v.taxId.startsWith(prefix)) issue("taxId");
    }
  });
export type SponsorBilling = z.infer<typeof sponsorBillingSchema>;
