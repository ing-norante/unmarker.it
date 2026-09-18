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
  it("requires a nine-digit US EIN before creating a Stripe customer", () => {
    const us = {
      ...billing,
      country: "US",
      taxIdType: "us_ein",
      postalCode: "10001",
      region: "NY",
      fiscalCode: "",
    };
    expect(
      sponsorBillingSchema.safeParse({ ...us, taxId: "12-3456789" }).success,
    ).toBe(true);
    expect(
      sponsorBillingSchema.safeParse({ ...us, taxId: "123456789" }).success,
    ).toBe(true);
    expect(
      sponsorBillingSchema.safeParse({ ...us, taxId: "12345678901" }).success,
    ).toBe(false);
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

describe("billing field feedback", () => {
  it("reports country-specific errors even with empty fields and unchecked approvals", () => {
    const result = sponsorBillingSchema.safeParse(billingDefaults);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["fiscalCode"],
            message: "fiscal_code",
          }),
          expect.objectContaining({
            path: ["postalCode"],
            message: "italian_postal",
          }),
          expect.objectContaining({
            path: ["region"],
            message: "italian_region",
          }),
          expect.objectContaining({
            path: ["businessPurchase"],
            message: "confirmation",
          }),
        ]),
      );
    }
  });
  it("normalizes valid billing details before checkout", () => {
    const result = sponsorBillingSchema.parse({
      ...billing,
      email: " billing@example.com ",
      taxId: "it 12345678903",
      region: "fi",
      pec: " ",
    });
    expect(result).toMatchObject({
      email: "billing@example.com",
      taxId: "IT12345678903",
      region: "FI",
      pec: "",
    });
  });
  it("reports an actionable PEC error without suppressing the other fields", () => {
    const result = sponsorBillingSchema.safeParse({
      ...billingDefaults,
      pec: "not-an-email",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["pec"], message: "email" }),
          expect.objectContaining({
            path: ["postalCode"],
            message: "italian_postal",
          }),
        ]),
      );
    }
  });
});
