import { useId, useRef, useState } from "react";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import {
  focusInvalidField,
  sponsorFieldErrors,
} from "@/lib/sponsorFormValidation";
import { SponsorFormProgress } from "@/components/SponsorFormProgress";
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
  const root = useRef<HTMLFormElement>(null);
  const [routingOpen, setRoutingOpen] = useState(
    !!(initial.recipientCode || initial.pec),
  );
  const form = useForm({
    defaultValues: initial,
    validationLogic: revalidateLogic({
      mode: "blur",
      modeAfterSubmission: "change",
    }),
    validators: { onDynamic: sponsorBillingSchema },
    onSubmitInvalid: () => {
      if (
        form.getFieldMeta("recipientCode")?.errors.length ||
        form.getFieldMeta("pec")?.errors.length
      )
        setRoutingOpen(true);
      focusInvalidField(root.current);
    },
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
              name={name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              aria-invalid={invalid}
              aria-describedby={invalid ? `${id}-${name}-error` : undefined}
              required={required}
              type={name === "email" || name === "pec" ? "email" : "text"}
              maxLength={
                {
                  legalName: 200,
                  taxId: 100,
                  fiscalCode: 16,
                  email: 254,
                  line1: 200,
                  city: 100,
                  postalCode: 20,
                  region: 100,
                  recipientCode: 7,
                  pec: 254,
                }[name]
              }
              autoCapitalize={
                ["taxId", "fiscalCode", "recipientCode", "region"].includes(
                  name,
                )
                  ? "characters"
                  : "none"
              }
              autoComplete={
                {
                  email: "email",
                  legalName: "organization",
                  line1: "address-line1",
                  city: "address-level2",
                  region: "address-level1",
                  postalCode: "postal-code",
                  taxId: "off",
                  fiscalCode: "off",
                  recipientCode: "off",
                  pec: "off",
                }[name]
              }
            />
            {invalid && (
              <FieldError
                id={`${id}-${name}-error`}
                errors={sponsorFieldErrors(field.state.meta.errors, t)}
              />
            )}
          </Field>
        );
      }}
    </form.Field>
  );
  return (
    <form
      ref={root}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <SponsorFormProgress step={2} />
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(busy) => (
          <fieldset
            disabled={busy}
            className="flex min-w-0 flex-col gap-8"
            aria-busy={busy}
          >
            <FieldSet>
              <FieldLegend>{t("sponsors.billing.businessHeading")}</FieldLegend>
              <FieldDescription>
                {t("sponsors.billing.description")}{" "}
                {t("sponsors.form.requiredHint")}
              </FieldDescription>
              <FieldGroup className="gap-4">
                <FieldGroup className="grid gap-4 sm:grid-cols-2">
                  {textField("legalName")}
                  {textField("email")}
                </FieldGroup>
                <form.Field name="country">
                  {(field) => {
                    const invalid =
                      field.state.meta.isTouched && !field.state.meta.isValid;
                    return (
                      <Field data-invalid={invalid}>
                        <FieldLabel htmlFor={`${id}-country`}>
                          {t("sponsors.billing.country")}
                        </FieldLabel>
                        <Combobox
                          items={countries}
                          value={field.state.value}
                          disabled={busy}
                          itemToStringLabel={(country) =>
                            regions.of(country) || country
                          }
                          onValueChange={(country) => {
                            if (!country || country === field.state.value)
                              return;
                            field.handleChange(country);
                            form.setFieldValue(
                              "taxIdType",
                              sponsorTaxTypesForCountry(country)[0]?.type || "",
                            );
                            for (const key of [
                              "taxId",
                              "fiscalCode",
                              "recipientCode",
                              "pec",
                            ] as const)
                              form.setFieldValue(key, "");
                            field.handleBlur();
                          }}
                        >
                          <ComboboxInput
                            triggerLabel={t("sponsors.billing.searchCountry")}
                            id={`${id}-country`}
                            name="country"
                            required
                            disabled={busy}
                            onBlur={field.handleBlur}
                            aria-invalid={invalid}
                            aria-describedby={`${id}-country-help${invalid ? ` ${id}-country-error` : ""}`}
                            placeholder={t("sponsors.billing.searchCountry")}
                          />
                          <ComboboxContent>
                            <ComboboxEmpty>
                              {t("sponsors.billing.noCountries")}
                            </ComboboxEmpty>
                            <ComboboxList>
                              {(country: string) => (
                                <ComboboxItem key={country} value={country}>
                                  {regions.of(country) || country}
                                </ComboboxItem>
                              )}
                            </ComboboxList>
                          </ComboboxContent>
                        </Combobox>
                        <FieldDescription id={`${id}-country-help`}>
                          {t("sponsors.billing.countryHint")}
                        </FieldDescription>
                        {invalid && (
                          <FieldError
                            id={`${id}-country-error`}
                            errors={sponsorFieldErrors(
                              field.state.meta.errors,
                              t,
                            )}
                          />
                        )}
                      </Field>
                    );
                  }}
                </form.Field>
                <form.Subscribe selector={(s) => s.values.country}>
                  {(country) => {
                    const types = sponsorTaxTypesForCountry(country);
                    return (
                      <FieldGroup className="gap-4">
                        {types.length > 1 && (
                          <form.Field name="taxIdType">
                            {(field) => {
                              const invalid =
                                field.state.meta.isTouched &&
                                !field.state.meta.isValid;
                              return (
                                <Field data-invalid={invalid}>
                                  <FieldLabel htmlFor={`${id}-tax-type`}>
                                    {t("sponsors.billing.taxIdType")}
                                  </FieldLabel>
                                  <Select
                                    name="taxIdType"
                                    value={field.state.value}
                                    disabled={busy}
                                    onValueChange={(value) => {
                                      field.handleChange(value);
                                      form.setFieldValue("taxId", "");
                                      field.handleBlur();
                                    }}
                                  >
                                    <SelectTrigger
                                      id={`${id}-tax-type`}
                                      className="w-full"
                                      onBlur={field.handleBlur}
                                      aria-invalid={invalid}
                                      aria-describedby={
                                        invalid
                                          ? `${id}-tax-type-error`
                                          : undefined
                                      }
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectGroup>
                                        {types.map((type) => (
                                          <SelectItem
                                            key={type.type}
                                            value={type.type}
                                          >
                                            {type.label}
                                          </SelectItem>
                                        ))}
                                      </SelectGroup>
                                    </SelectContent>
                                  </Select>
                                  {invalid && (
                                    <FieldError
                                      id={`${id}-tax-type-error`}
                                      errors={sponsorFieldErrors(
                                        field.state.meta.errors,
                                        t,
                                      )}
                                    />
                                  )}
                                </Field>
                              );
                            }}
                          </form.Field>
                        )}
                        <FieldGroup className="grid gap-4 sm:grid-cols-2">
                          {textField("taxId")}
                          {country === "IT" && textField("fiscalCode")}
                        </FieldGroup>
                      </FieldGroup>
                    );
                  }}
                </form.Subscribe>
              </FieldGroup>
            </FieldSet>
            <FieldSet>
              <FieldLegend>{t("sponsors.billing.addressHeading")}</FieldLegend>
              <FieldGroup className="gap-4">
                {textField("line1")}
                <form.Subscribe selector={(s) => s.values.country}>
                  {(country) => (
                    <FieldGroup className="grid gap-4 sm:grid-cols-2">
                      {textField("city")}
                      {textField(
                        "postalCode",
                        ["IT", "US", "CA"].includes(country),
                      )}
                      {textField(
                        "region",
                        ["IT", "US", "CA"].includes(country),
                      )}
                    </FieldGroup>
                  )}
                </form.Subscribe>
              </FieldGroup>
            </FieldSet>
            <form.Subscribe selector={(s) => s.values.country}>
              {(country) =>
                country === "IT" && (
                  <Collapsible open={routingOpen} onOpenChange={setRoutingOpen}>
                    <CollapsibleTrigger asChild>
                      <Button type="button" variant="ghost">
                        {t("sponsors.billing.routingTitle")}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent forceMount hidden={!routingOpen}>
                      <FieldSet className="mt-4">
                        <FieldLegend className="sr-only">
                          {t("sponsors.billing.routingTitle")}
                        </FieldLegend>
                        <FieldDescription>
                          {t("sponsors.billing.routingHint")}
                        </FieldDescription>
                        <FieldGroup className="grid gap-4 sm:grid-cols-2">
                          {textField("recipientCode", false)}
                          {textField("pec", false)}
                        </FieldGroup>
                      </FieldSet>
                    </CollapsibleContent>
                  </Collapsible>
                )
              }
            </form.Subscribe>
            <FieldSet>
              <FieldLegend>{t("sponsors.billing.conditions")}</FieldLegend>
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
              <FieldGroup data-slot="checkbox-group" className="gap-4">
                {(
                  [
                    "businessPurchase",
                    "termsAccepted",
                    "clausesAccepted",
                  ] as const
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
                              name={name}
                              checked={field.state.value}
                              disabled={busy}
                              onCheckedChange={(v) =>
                                field.handleChange(v === true)
                              }
                              onBlur={field.handleBlur}
                              aria-invalid={invalid}
                              aria-required="true"
                              aria-describedby={
                                invalid ? `${id}-${name}-error` : undefined
                              }
                            />
                            <FieldLabel htmlFor={`${id}-${name}`}>
                              {t(`sponsors.billing.${name}`)}
                            </FieldLabel>
                          </Field>
                          {invalid && (
                            <FieldError
                              id={`${id}-${name}-error`}
                              errors={sponsorFieldErrors(
                                field.state.meta.errors,
                                t,
                              )}
                            />
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
            <div className="flex flex-col gap-3">
              <p className="text-muted-foreground text-sm">
                {t("sponsors.billing.totalHint")}
              </p>
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
            </div>
          </fieldset>
        )}
      </form.Subscribe>
    </form>
  );
}
