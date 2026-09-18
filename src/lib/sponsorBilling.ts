import { z } from "zod";
import { sponsorTaxIdTypes } from "./sponsorTaxIds.ts";

// English v1.0.0 terms approved for publication on 18 September 2026.
// Live payments still require server opt-in and an approved country list.
export const SPONSOR_TERMS_VERSION = "v1.0.0";
export const SPONSOR_TERMS_PUBLISHED: boolean = true;
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
const text = (max: number) =>
  z.string().trim().min(1, "required").max(max, "too_long");
export const sponsorBillingSchema = z
  .object({
    legalName: text(200),
    country: text(2).toUpperCase(),
    taxIdType: text(30),
    taxId: text(100).overwrite((v) => v.replace(/\s/g, "").toUpperCase()),
    fiscalCode: z.string().trim().max(16, "fiscal_code").toUpperCase(),
    email: z.string().trim().pipe(z.email("email").max(254, "too_long")),
    line1: text(200),
    city: text(100),
    postalCode: z.string().trim().max(20, "too_long"),
    region: z.string().trim().max(100, "too_long").toUpperCase(),
    recipientCode: z.string().trim().max(7, "recipient_code").toUpperCase(),
    pec: z
      .string()
      .trim()
      .max(254, "too_long")
      .refine(
        (value) => value === "" || z.email().safeParse(value).success,
        "email",
      ),
    businessPurchase: z.boolean().refine((value) => value, "confirmation"),
    termsAccepted: z.boolean().refine((value) => value, "confirmation"),
    clausesAccepted: z.boolean().refine((value) => value, "confirmation"),
    termsVersion: z.literal(SPONSOR_TERMS_VERSION, "terms_changed"),
  })
  .superRefine((v, ctx) => {
    const issue = (path: keyof typeof billingDefaults, message: string) =>
      ctx.addIssue({
        code: "custom",
        path: [path],
        message,
      });
    if (
      !Object.hasOwn(sponsorTaxIdTypes, v.country) ||
      ["EU", "IC"].includes(v.country)
    )
      issue("country", "country");
    else if (
      !sponsorTaxTypesForCountry(v.country).some((t) => t.type === v.taxIdType)
    )
      issue("taxIdType", "tax_type");
    if (v.country === "IT") {
      if (!validItalianVat(v.taxId)) issue("taxId", "italian_vat");
      if (!(
        validItalianVat(v.fiscalCode) ||
        /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(
          v.fiscalCode,
        )
      ))
        issue("fiscalCode", "fiscal_code");
      if (!/^\d{5}$/.test(v.postalCode)) issue("postalCode", "italian_postal");
      if (!/^[A-Z]{2}$/.test(v.region)) issue("region", "italian_region");
      if (v.recipientCode && !/^[A-Z0-9]{7}$/.test(v.recipientCode))
        issue("recipientCode", "recipient_code");
      // No routing code is legitimate: use 0000000 in the eventual SdI export.
      if (v.recipientCode === "XXXXXXX")
        issue("recipientCode", "recipient_code");
    }
    if (["US", "CA"].includes(v.country)) {
      if (!v.postalCode) issue("postalCode", "required");
      if (!v.region) issue("region", "required");
    }
    if (
      v.country === "US" &&
      v.taxIdType === "us_ein" &&
      !/^(?:\d{9}|\d{2}-\d{7})$/.test(v.taxId)
    )
      issue("taxId", "us_ein");
    if (EU_COUNTRIES.has(v.country)) {
      const prefix = v.country === "GR" ? "EL" : v.country;
      if (!v.taxId.startsWith(prefix)) issue("taxId", "vat_prefix");
    }
  });
export type SponsorBilling = z.infer<typeof sponsorBillingSchema>;
