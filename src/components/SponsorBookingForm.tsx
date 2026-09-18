import { useEffect, useId, useRef, useState } from "react";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useTranslation } from "react-i18next";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import {
  Attachment,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
  AttachmentActions,
  AttachmentAction,
} from "@/components/ui/attachment";
import { XIcon } from "@phosphor-icons/react/dist/ssr/X";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { SponsorSingleCard } from "@/components/SponsorSingleCard";
import { MobileSponsorChip } from "@/components/MobileSponsorChip";
import { SponsorFormProgress } from "@/components/SponsorFormProgress";
import {
  sponsorBookingSchema,
  sponsorIconSchema,
  sponsorFieldErrors,
  focusInvalidField,
  validateSponsorIcon,
} from "@/lib/sponsorFormValidation";
import {
  Field,
  FieldDescription,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
  createSponsorCheckout,
  getSponsorPurchases,
  cancelSponsorPurchase,
  getSponsorPurchase,
} from "@/lib/sponsorApi";
import {
  MAX_SPONSOR_DESCRIPTION_LENGTH,
  type SponsorPurchaseStatus,
} from "@/lib/sponsorPurchase";
import { trackSponsorEvent } from "@/lib/analytics";
import { sponsorship } from "@/lib/sponsors";
import type SponsorBillingForm from "./SponsorBillingForm";
import { billingDefaults, type SponsorBilling } from "@/lib/sponsorBilling";

export default function SponsorBookingForm({
  checkoutEnabled,
  availableSpots,
  catalogStatus,
}: {
  checkoutEnabled: boolean;
  availableSpots?: number;
  catalogStatus: "loading" | "ready" | "error";
}) {
  const { t, i18n } = useTranslation("common");
  const id = useId();
  const root = useRef<HTMLFormElement>(null);
  const iconInput = useRef<HTMLInputElement>(null);
  const focusStep = () =>
    requestAnimationFrame(() => {
      const step = document.getElementById(`${id}-step`);
      step?.focus({ preventScroll: true });
      step?.scrollIntoView({ block: "start" });
    });
  const [billingStep, setBillingStep] = useState(false);
  const [BillingForm, setBillingForm] = useState<
    typeof SponsorBillingForm | null
  >(null);
  const [billingDraft, setBillingDraft] = useState(billingDefaults);
  const billingRef = useRef<SponsorBilling | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<SponsorPurchaseStatus | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const price = new Intl.NumberFormat(i18n.resolvedLanguage ?? "en", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(sponsorship.priceEur);
  const message = (code: string) =>
    t(`sponsors.errors.${code}`, {
      defaultValue: t("sponsors.errors.temporary_error"),
    });
  const findPending = async () => {
    try {
      const purchase =
        (await getSponsorPurchases()).find((p) =>
          ["pending", "creating", "attention"].includes(p.status),
        ) ?? null;
      setPending(purchase);
      if (purchase) setBillingStep(false);
    } catch {
      /* Main submit shows actionable errors. */
    }
  };
  useEffect(() => {
    let cancelled = false;
    if (checkoutEnabled) {
      void getSponsorPurchases()
        .then((purchases) => {
          if (!cancelled)
            setPending(
              purchases.find((p) =>
                ["pending", "creating", "attention"].includes(p.status),
              ) ?? null,
            );
        })
        .catch(() => {
          /* Submit provides an actionable error if the API is unavailable. */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [checkoutEnabled]);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );
  const form = useForm({
    defaultValues: {
      name: "",
      url: "",
      description: "",
      mobileShowUrl: false,
      icon: null as File | null,
    },
    validationLogic: revalidateLogic({
      mode: "blur",
      modeAfterSubmission: "change",
    }),
    validators: { onDynamic: sponsorBookingSchema },
    onSubmitInvalid: () => focusInvalidField(root.current),
    onSubmit: async ({ value }) => {
      setError(null);
      if (!checkoutEnabled || availableSpots === 0 || pending) {
        setError(
          pending
            ? "existing_checkout"
            : !checkoutEnabled
              ? "unavailable"
              : "sold_out",
        );
        return;
      }
      if (!billingStep) {
        try {
          // Keep the filled creative mounted if the next step cannot load.
          const module = await import("./SponsorBillingForm");
          setBillingForm(() => module.default);
          setBillingStep(true);
          focusStep();
        } catch {
          setError("billing_load_failed");
        }
        return;
      }
      if (!billingRef.current) return;
      try {
        const data = new FormData();
        for (const key of ["name", "url", "description"] as const)
          data.set(key, value[key]);
        data.set("mobileShowUrl", String(value.mobileShowUrl));
        data.set("icon", value.icon!);
        data.set("requestId", requestId);
        data.set("billing", JSON.stringify(billingRef.current));
        const purchase = await createSponsorCheckout(data);
        if (!purchase.checkoutUrl) {
          setPending(purchase);
          throw new Error("payment_pending");
        }
        trackSponsorEvent("sponsor_checkout_clicked", {
          purchase_id: purchase.id,
          price_eur: 500,
          duration_days: 30,
          payment_model: "one_time",
        });
        window.location.assign(purchase.checkoutUrl);
      } catch (e) {
        const code = e instanceof Error ? e.message : "temporary_error";
        setError(code);
        if (code === "tax_id_invalid") setRequestId(crypto.randomUUID());
        void findPending();
      }
    },
  });
  if (billingStep && BillingForm)
    return (
      <section
        id={`${id}-step`}
        tabIndex={-1}
        aria-label={t("sponsors.form.steps.billing")}
      >
        <BillingForm
          initial={billingDraft}
          checkoutEnabled={checkoutEnabled && availableSpots !== 0}
          error={error}
          onBack={(draft) => {
            setBillingDraft(draft);
            setBillingStep(false);
            setError(null);
            focusStep();
          }}
          onSubmit={async (billing) => {
            billingRef.current = billing;
            setBillingDraft(billing);
            await form.handleSubmit();
          }}
        />
      </section>
    );
  return (
    <form
      ref={root}
      id={`${id}-step`}
      tabIndex={-1}
      noValidate
      aria-label={t("sponsors.form.steps.creative")}
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <SponsorFormProgress step={1} />
      <FieldSet>
        <FieldLegend>{t("sponsors.form.creativeTitle")}</FieldLegend>
        <FieldDescription>
          {t("sponsors.form.creativeHint")} {t("sponsors.form.requiredHint")}
        </FieldDescription>
        <FieldGroup className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {(["name", "url", "description"] as const).map((name) => (
            <form.Field key={name} name={name}>
              {(field) => {
                const invalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                const props = {
                  id: `${id}-${name}`,
                  name,
                  value: field.state.value,
                  onBlur: field.handleBlur,
                  onChange: (
                    e: React.ChangeEvent<
                      HTMLInputElement | HTMLTextAreaElement
                    >,
                  ) => field.handleChange(e.target.value),
                  "aria-invalid": invalid,
                  "aria-describedby": `${id}-${name}-help${invalid ? ` ${id}-${name}-error` : ""}`,
                  required: true,
                  maxLength:
                    name === "name"
                      ? 32
                      : name === "url"
                        ? 500
                        : MAX_SPONSOR_DESCRIPTION_LENGTH,
                };
                return (
                  <Field
                    data-invalid={invalid}
                    className={
                      name === "description" ? "sm:col-span-2" : undefined
                    }
                  >
                    <FieldLabel htmlFor={props.id}>
                      {t(`sponsors.form.${name}`)}
                    </FieldLabel>
                    {name === "description" ? (
                      <InputGroup>
                        <InputGroupTextarea
                          {...props}
                          minLength={10}
                          rows={3}
                          placeholder={t(
                            "sponsors.form.descriptionPlaceholder",
                          )}
                        />
                        <InputGroupAddon align="block-end">
                          <InputGroupText className="ml-auto">
                            {field.state.value.length}/
                            {MAX_SPONSOR_DESCRIPTION_LENGTH}
                          </InputGroupText>
                        </InputGroupAddon>
                      </InputGroup>
                    ) : (
                      <Input
                        {...props}
                        minLength={name === "name" ? 2 : undefined}
                        type={name === "url" ? "url" : "text"}
                        placeholder={
                          name === "url"
                            ? "https://example.com"
                            : t("sponsors.form.namePlaceholder")
                        }
                        autoComplete="off"
                      />
                    )}
                    <FieldDescription id={`${id}-${name}-help`}>
                      {t(`sponsors.form.${name}Hint`)}
                    </FieldDescription>
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
          ))}
          <form.Field
            name="icon"
            validators={{
              onChangeAsync: ({ value }) => validateSponsorIcon(value),
              onSubmitAsync: ({ value }) => validateSponsorIcon(value),
            }}
          >
            {(field) => {
              const invalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={invalid} className="sm:col-span-2">
                  <FieldTitle>{t("sponsors.form.icon")}</FieldTitle>
                  <Button
                    id={`${id}-icon`}
                    type="button"
                    variant="outline"
                    className="w-fit"
                    aria-invalid={invalid}
                    aria-describedby={`${id}-icon-help${invalid ? ` ${id}-icon-error` : ""}`}
                    onBlur={field.handleBlur}
                    onClick={() => iconInput.current?.click()}
                  >
                    {t(
                      field.state.value
                        ? "sponsors.form.replaceIcon"
                        : "sponsors.form.chooseIcon",
                    )}
                  </Button>
                  <input
                    ref={iconInput}
                    hidden
                    id={`${id}-icon-file`}
                    name="icon"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label={t("sponsors.form.icon")}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      field.handleChange(file);
                      field.handleBlur();
                      if (previewRef.current)
                        URL.revokeObjectURL(previewRef.current);
                      previewRef.current =
                        file && sponsorIconSchema.safeParse(file).success
                          ? URL.createObjectURL(file)
                          : null;
                      setPreview(previewRef.current);
                    }}
                  />
                  <FieldDescription id={`${id}-icon-help`}>
                    {t("sponsors.form.iconHint")}
                  </FieldDescription>
                  {field.state.value && (
                    <Attachment
                      state={
                        invalid
                          ? "error"
                          : field.state.meta.isValidating
                            ? "processing"
                            : "done"
                      }
                    >
                      {preview && (
                        <AttachmentMedia variant="image">
                          <img src={preview} alt="" />
                        </AttachmentMedia>
                      )}
                      <AttachmentContent>
                        <AttachmentTitle>
                          {field.state.value.name}
                        </AttachmentTitle>
                        <AttachmentDescription>
                          {Math.ceil(field.state.value.size / 1024)} KB ·{" "}
                          {t("sponsors.form.iconSelected")}
                        </AttachmentDescription>
                      </AttachmentContent>
                      <AttachmentActions>
                        <AttachmentAction
                          type="button"
                          aria-label={t("sponsors.form.removeIcon")}
                          onClick={() => {
                            field.handleChange(null);
                            if (iconInput.current) iconInput.current.value = "";
                            if (previewRef.current)
                              URL.revokeObjectURL(previewRef.current);
                            previewRef.current = null;
                            setPreview(null);
                            document.getElementById(`${id}-icon`)?.focus();
                          }}
                        >
                          <XIcon />
                        </AttachmentAction>
                      </AttachmentActions>
                    </Attachment>
                  )}
                  {field.state.meta.isValidating && (
                    <p className="text-muted-foreground text-xs" role="status">
                      {t("sponsors.form.checkingIcon")}
                    </p>
                  )}
                  {invalid && (
                    <FieldError
                      id={`${id}-icon-error`}
                      errors={sponsorFieldErrors(field.state.meta.errors, t)}
                    />
                  )}
                </Field>
              );
            }}
          </form.Field>
        </FieldGroup>
      </FieldSet>
      <Collapsible defaultOpen className="mt-6">
        <h2>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              type="button"
              className="justify-start px-0"
            >
              {t("sponsors.form.preview")}
              <CaretRightIcon
                aria-hidden="true"
                className="shrink-0 group-data-[state=open]/button:rotate-90"
              />
            </Button>
          </CollapsibleTrigger>
        </h2>
        <CollapsibleContent>
          <form.Subscribe selector={(s) => s.values}>
            {(values) => {
              const sponsor = {
                id: "preview",
                name: values.name.trim() || t("sponsors.form.namePlaceholder"),
                url: values.url.trim() || "https://example.com",
                claim:
                  values.description.trim() ||
                  t("sponsors.form.descriptionPlaceholder"),
                icon: preview || "◇",
                mobileShowUrl: values.mobileShowUrl,
              };
              return (
                <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
                  <div className="flex min-w-0 flex-col gap-3">
                    <p className="text-muted-foreground text-xs font-semibold">
                      {t("sponsors.form.desktopPreview")}
                    </p>
                    <div className="overflow-x-auto pb-1">
                      <SponsorSingleCard
                        sponsor={sponsor}
                        preview
                        className="sponsor-card-preview"
                      />
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-col gap-3">
                    <p className="text-muted-foreground text-xs font-semibold">
                      {t("sponsors.form.mobilePreview")}
                    </p>
                    <div className="flex overflow-x-auto pb-1">
                      <MobileSponsorChip sponsor={sponsor} preview />
                    </div>
                    <form.Field name="mobileShowUrl">
                      {(field) => (
                        <Field orientation="horizontal">
                          <Checkbox
                            id={`${id}-mobile-show-url`}
                            name={field.name}
                            checked={field.state.value}
                            onCheckedChange={(checked) =>
                              field.handleChange(checked === true)
                            }
                            onBlur={field.handleBlur}
                            aria-describedby={`${id}-mobile-show-url-help`}
                          />
                          <FieldContent>
                            <FieldLabel htmlFor={`${id}-mobile-show-url`}>
                              {t("sponsors.form.mobileShowUrl")}
                            </FieldLabel>
                            <FieldDescription id={`${id}-mobile-show-url-help`}>
                              {t("sponsors.form.mobileShowUrlHint")}
                            </FieldDescription>
                          </FieldContent>
                        </Field>
                      )}
                    </form.Field>
                  </div>
                </div>
              );
            }}
          </form.Subscribe>
        </CollapsibleContent>
      </Collapsible>
      <div className="mt-6 flex flex-col gap-3">
        {pending && (
          <Alert>
            <AlertTitle>{t("sponsors.pendingCheckout")}</AlertTitle>
            <AlertDescription>
              <span>{pending.name}</span>
              <div className="flex flex-wrap gap-2">
                {pending.checkoutUrl && (
                  <Button asChild size="sm">
                    <a href={pending.checkoutUrl}>
                      {t("sponsors.resumeCheckout")}
                    </a>
                  </Button>
                )}
                {!pending.checkoutUrl && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={cancelling}
                    onClick={async () => {
                      setError(null);
                      try {
                        const result = await getSponsorPurchase(pending.id);
                        setPending(result);
                        if (result.checkoutUrl)
                          window.location.assign(result.checkoutUrl);
                        if (result.status === "cancelled") {
                          setPending(null);
                          setRequestId(crypto.randomUUID());
                        }
                      } catch (e) {
                        const code =
                          e instanceof Error ? e.message : "temporary_error";
                        setError(code);
                        if (code === "tax_id_invalid") {
                          setRequestId(crypto.randomUUID());
                          void findPending();
                        }
                      }
                    }}
                  >
                    {t("sponsors.billing.retry")}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={cancelling}
                  onClick={async () => {
                    setCancelling(true);
                    try {
                      const result = await cancelSponsorPurchase(pending.id);
                      setPending(null);
                      setRequestId(crypto.randomUUID());
                      setError(null);
                      if (result.status === "active")
                        window.location.assign(
                          `/?sponsor_purchase=${result.id}`,
                        );
                      window.dispatchEvent(
                        new Event("unmarker:sponsors-refresh"),
                      );
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "temporary_error",
                      );
                    } finally {
                      setCancelling(false);
                    }
                  }}
                >
                  {cancelling && <Spinner data-icon="inline-start" />}
                  {t("sponsors.cancelCheckout")}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertTitle>{t("sponsors.form.errorTitle")}</AlertTitle>
            <AlertDescription>{message(error)}</AlertDescription>
          </Alert>
        )}
        {catalogStatus === "ready" &&
          (!checkoutEnabled || availableSpots === 0) && (
            <p className="text-muted-foreground text-sm">
              {t(
                availableSpots === 0 && checkoutEnabled
                  ? "sponsors.soldOut"
                  : "sponsors.bookingUnavailable",
              )}
            </p>
          )}
        <form.Subscribe
          selector={(s) => [s.isSubmitting, s.isValidating] as const}
        >
          {([submitting, validating]) => (
            <Button
              className="w-full"
              type="submit"
              aria-busy={submitting || validating}
              disabled={
                submitting ||
                validating ||
                !checkoutEnabled ||
                availableSpots === 0 ||
                pending !== null
              }
            >
              {submitting || validating ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <ArrowRightIcon data-icon="inline-start" />
              )}
              {t(
                validating
                  ? "sponsors.form.checkingIcon"
                  : submitting
                    ? "sponsors.loadingBilling"
                    : "sponsors.billing.next",
                { price },
              )}
            </Button>
          )}
        </form.Subscribe>
        <p className="text-muted-foreground text-center text-xs">
          {t("sponsors.secureCheckout")}
        </p>
      </div>
    </form>
  );
}
