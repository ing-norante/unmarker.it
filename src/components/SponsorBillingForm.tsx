import { useId } from "react";
import { useForm } from "@tanstack/react-form";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
  FieldDescription,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
  sponsorBillingSchema,
  sponsorTaxTypesForCountry,
  billingDefaults,
  SPONSOR_TERMS_PUBLISHED,
  type SponsorBilling,
} from "@/lib/sponsorBilling";
import { sponsorTaxIdTypes } from "@/lib/sponsorTaxIds";
import { legalDocuments } from "@/lib/legalDocuments";

export default function SponsorBillingForm({
  initial,
  onBack,
  onSubmit,
  error,
}: {
  initial: typeof billingDefaults;
  onBack: (draft: typeof billingDefaults) => void;
  onSubmit: (billing: SponsorBilling) => Promise<void>;
  error: string | null;
}) {
  const { t, i18n } = useTranslation("common");
  const id = useId();
  const form = useForm({
    defaultValues: initial,
    validators: { onSubmit: sponsorBillingSchema },
    onSubmit: async ({ value }) => onSubmit(sponsorBillingSchema.parse(value)),
  });
  const regions = new Intl.DisplayNames([i18n.resolvedLanguage || "en"], {
    type: "region",
  });
  const countries = Object.keys(sponsorTaxIdTypes)
    .filter((c) => !["EU", "IC"].includes(c))
    .sort((a, b) => (regions.of(a) || a).localeCompare(regions.of(b) || b));
  const textField = (
    name:
      | "legalName"
      | "taxId"
      | "fiscalCode"
      | "email"
      | "line1"
      | "city"
      | "postalCode"
      | "region"
      | "recipientCode"
      | "pec",
    required = true,
  ) => (
    <form.Field key={name} name={name}>
      {(field) => {
        const invalid = field.state.meta.isTouched && !field.state.meta.isValid;
        return (
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor={`${id}-${name}`}>
              {t(`sponsors.billing.${name}`)}
              {!required && ` (${t("sponsors.billing.optional")})`}
            </FieldLabel>
            <Input
              id={`${id}-${name}`}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              aria-invalid={invalid}
              aria-describedby={invalid ? `${id}-${name}-error` : undefined}
              required={required}
              type={name === "email" || name === "pec" ? "email" : "text"}
              maxLength={
                name === "fiscalCode" ? 16 : name === "recipientCode" ? 7 : 254
              }
              autoComplete={
                name === "email"
                  ? "email"
                  : name === "legalName"
                    ? "organization"
                    : name === "line1"
                      ? "address-line1"
                      : name === "city"
                        ? "address-level2"
                        : name === "region"
                          ? "address-level1"
                          : name === "postalCode"
                            ? "postal-code"
                            : "off"
              }
            />
            {invalid && (
              <FieldError id={`${id}-${name}-error`}>
                {t("sponsors.billing.checkField")}
              </FieldError>
            )}
          </Field>
        );
      }}
    </form.Field>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-5"
    >
      <FieldSet>
        <FieldLegend>{t("sponsors.billing.title")}</FieldLegend>
        <FieldDescription>{t("sponsors.billing.description")}</FieldDescription>
        <FieldGroup className="gap-4">
          {textField("legalName")}
          {textField("email")}
          <form.Field name="country">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={`${id}-country`}>
                  {t("sponsors.billing.country")}
                </FieldLabel>
                <NativeSelect
                  id={`${id}-country`}
                  value={field.state.value}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                    form.setFieldValue(
                      "taxIdType",
                      sponsorTaxTypesForCountry(e.target.value)[0].type,
                    );
                    form.setFieldValue("taxId", "");
                    for (const key of [
                      "fiscalCode",
                      "recipientCode",
                      "pec",
                    ] as const)
                      form.setFieldValue(key, "");
                  }}
                  onBlur={field.handleBlur}
                >
                  {countries.map((country) => (
                    <NativeSelectOption key={country} value={country}>
                      {regions.of(country)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldDescription>
                  {t("sponsors.billing.countryHint")}
                </FieldDescription>
              </Field>
            )}
          </form.Field>
          <form.Subscribe selector={(s) => s.values.country}>
            {(country) => {
              const types = sponsorTaxTypesForCountry(country);
              return (
                <FieldGroup className="gap-4">
                  {types.length > 1 && (
                    <form.Field name="taxIdType">
                      {(field) => (
                        <Field>
                          <FieldLabel htmlFor={`${id}-tax-type`}>
                            {t("sponsors.billing.taxIdType")}
                          </FieldLabel>
                          <NativeSelect
                            id={`${id}-tax-type`}
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                          >
                            {types.map((type) => (
                              <NativeSelectOption
                                key={type.type}
                                value={type.type}
                              >
                                {type.label}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        </Field>
                      )}
                    </form.Field>
                  )}
                  {textField("taxId")}
                  {country === "IT" && textField("fiscalCode")}
                  {textField("line1")}
                  <FieldGroup className="grid gap-4 sm:grid-cols-2">
                    {textField("city")}
                    {textField(
                      "postalCode",
                      ["IT", "US", "CA"].includes(country),
                    )}
                    {textField(
                      "region",
                      country === "IT" || country === "US" || country === "CA",
                    )}
                  </FieldGroup>
                  {country === "IT" && (
                    <FieldGroup className="gap-4">
                      {textField("recipientCode", false)}
                      {textField("pec", false)}
                      <FieldDescription>
                        {t("sponsors.billing.routingHint")}
                      </FieldDescription>
                    </FieldGroup>
                  )}
                </FieldGroup>
              );
            }}
          </form.Subscribe>
        </FieldGroup>
      </FieldSet>
      <FieldSet>
        <FieldLegend variant="label">
          {t("sponsors.billing.conditions")}
        </FieldLegend>
        <FieldDescription>
          <a
            href={legalDocuments.terms}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("footer.terms")}
          </a>
          {" · "}
          <a
            href={legalDocuments.privacy}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("footer.privacy")}
          </a>
        </FieldDescription>
        {!SPONSOR_TERMS_PUBLISHED && (
          <FieldDescription>
            {t("sponsors.billing.draftNotice")}
          </FieldDescription>
        )}
        <FieldGroup className="gap-3">
          {(
            ["businessPurchase", "termsAccepted", "clausesAccepted"] as const
          ).map((name) => (
            <form.Field key={name} name={name}>
              {(field) => {
                const invalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={invalid}>
                    <Field orientation="horizontal">
                      <Checkbox
                        id={`${id}-${name}`}
                        checked={field.state.value}
                        onCheckedChange={(v) => field.handleChange(v === true)}
                        onBlur={field.handleBlur}
                        aria-invalid={invalid}
                      />
                      <FieldLabel htmlFor={`${id}-${name}`}>
                        {t(`sponsors.billing.${name}`)}
                      </FieldLabel>
                    </Field>
                    {invalid && (
                      <FieldError>
                        {t("sponsors.billing.requiredConfirmation")}
                      </FieldError>
                    )}
                  </Field>
                );
              }}
            </form.Field>
          ))}
        </FieldGroup>
      </FieldSet>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{t("sponsors.form.errorTitle")}</AlertTitle>
          <AlertDescription>
            {t(`sponsors.errors.${error}`, {
              defaultValue: t("sponsors.errors.temporary_error"),
            })}
          </AlertDescription>
        </Alert>
      )}
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(busy) => (
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              type="button"
              disabled={busy}
              onClick={() => onBack(form.state.values)}
            >
              {t("sponsors.billing.back")}
            </Button>
            <Button type="submit" disabled={busy} className="flex-1">
              {busy && <Spinner data-icon="inline-start" />}
              {t(
                busy
                  ? "sponsors.preparingCheckout"
                  : "sponsors.billing.continue",
              )}
            </Button>
          </div>
        )}
      </form.Subscribe>
      <p className="text-muted-foreground text-xs">
        {t("sponsors.billing.totalHint")}
      </p>
    </form>
  );
}
