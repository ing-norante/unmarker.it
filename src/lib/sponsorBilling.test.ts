import { describe, it, expect } from "vitest";
import {
  billingDefaults,
  sponsorBillingSchema,
  sponsorTaxTypesForCountry,
  validItalianVat,
} from "./sponsorBilling";
const billing = {
  ...billingDefaults,
  legalName: "Example SRL",
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
};
describe("B2B billing validation", () => {
  it("accepts Italian businesses without an SdI code and requires the fiscal code", () => {
    expect(sponsorBillingSchema.safeParse(billing).success).toBe(true);
    expect(
      sponsorBillingSchema.safeParse({ ...billing, fiscalCode: "" }).success,
    ).toBe(false);
  });
  it("requires VAT for EU businesses rather than personal tax identifiers", () => {
    expect(sponsorTaxTypesForCountry("IT").map((t) => t.type)).toEqual([
      "eu_vat",
    ]);
    expect(
      sponsorBillingSchema.safeParse({ ...billing, taxIdType: "it_cf" })
        .success,
    ).toBe(false);
  });
  it("checks the VAT checksum without claiming it verifies the business", () => {
    expect(validItalianVat("IT12345678903")).toBe(true);
    expect(validItalianVat("IT12345678904")).toBe(false);
    expect(validItalianVat("IT00000000000")).toBe(false);
  });
  it("requires business purpose and both unselected approvals", () => {
    for (const key of ["businessPurchase", "termsAccepted", "clausesAccepted"])
      expect(
        sponsorBillingSchema.safeParse({ ...billing, [key]: false }).success,
      ).toBe(false);
  });
  it("prevents using an unrelated country's tax ID type", () => {
    expect(
      sponsorBillingSchema.safeParse({
        ...billing,
        country: "US",
        taxIdType: "us_ein",
        taxId: "12-3456789",
      }).success,
    ).toBe(true);
    expect(
      sponsorBillingSchema.safeParse({
        ...billing,
        country: "US",
        taxIdType: "eu_vat",
      }).success,
    ).toBe(false);
  });
  it("requires country prefixes for EU VAT and the current terms version", () => {
    expect(
      sponsorBillingSchema.safeParse({
        ...billing,
        country: "DE",
        taxId: "DE123456789",
        fiscalCode: "",
      }).success,
    ).toBe(true);
    expect(
      sponsorBillingSchema.safeParse({
        ...billing,
        country: "DE",
        taxId: "FR123456789",
      }).success,
    ).toBe(false);
    expect(
      sponsorBillingSchema.safeParse({ ...billing, termsVersion: "old" })
        .success,
    ).toBe(false);
  });
});
