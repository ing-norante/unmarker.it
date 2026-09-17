import { useEffect, useId, useRef, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
  createSponsorCheckout,
  getSponsorPurchases,
  cancelSponsorPurchase,
} from "@/lib/sponsorApi";
import {
  sponsorCreativeSchema,
  MAX_ICON_BYTES,
  type SponsorPurchaseStatus,
} from "@/lib/sponsorPurchase";
import { trackSponsorEvent } from "@/lib/analytics";
import { sponsorship } from "@/lib/sponsors";

export default function SponsorBookingForm({
  checkoutEnabled,
  availableSpots,
}: {
  checkoutEnabled: boolean;
  availableSpots: number;
}) {
  const { t, i18n } = useTranslation("common");
  const id = useId();
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
      setPending(
        (await getSponsorPurchases()).find((p) =>
          ["pending", "creating", "attention"].includes(p.status),
        ) ?? null,
      );
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
      icon: null as File | null,
    },
    validators: {
      onSubmit: z.object({
        name: sponsorCreativeSchema.shape.name,
        url: sponsorCreativeSchema.shape.url,
        description: sponsorCreativeSchema.shape.description,
        icon: z.custom<File>(
          (v) =>
            v instanceof File &&
            v.size > 0 &&
            v.size <= MAX_ICON_BYTES &&
            ["image/png", "image/jpeg", "image/webp"].includes(v.type),
        ),
      }),
    },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        const data = new FormData();
        for (const key of ["name", "url", "description"] as const)
          data.set(key, value[key]);
        data.set("icon", value.icon!);
        data.set("requestId", requestId);
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
        setError(e instanceof Error ? e.message : "temporary_error");
        void findPending();
      }
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="space-y-4">
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
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
                  "aria-describedby": `${id}-${name}-help`,
                  required: true,
                  maxLength: name === "name" ? 32 : name === "url" ? 500 : 120,
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
                      <Textarea
                        {...props}
                        minLength={10}
                        rows={3}
                        placeholder={t("sponsors.form.descriptionPlaceholder")}
                      />
                    ) : (
                      <Input
                        {...props}
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
                      {name === "description"
                        ? `${field.state.value.length}/120`
                        : t(`sponsors.form.${name}Hint`)}
                    </FieldDescription>
                    {invalid && (
                      <FieldError>{t(`sponsors.form.${name}Error`)}</FieldError>
                    )}
                  </Field>
                );
              }}
            </form.Field>
          ))}
          <form.Field name="icon">
            {(field) => {
              const invalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={invalid} className="sm:col-span-2">
                  <FieldLabel htmlFor={`${id}-icon`}>
                    {t("sponsors.form.icon")}
                  </FieldLabel>
                  <Input
                    id={`${id}-icon`}
                    name="icon"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    required
                    aria-invalid={invalid}
                    aria-describedby={`${id}-icon-help`}
                    onBlur={field.handleBlur}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      field.handleChange(file);
                      if (previewRef.current)
                        URL.revokeObjectURL(previewRef.current);
                      previewRef.current =
                        file &&
                        file.size <= MAX_ICON_BYTES &&
                        ["image/png", "image/jpeg", "image/webp"].includes(
                          file.type,
                        )
                          ? URL.createObjectURL(file)
                          : null;
                      setPreview(previewRef.current);
                    }}
                  />
                  <FieldDescription id={`${id}-icon-help`}>
                    {t("sponsors.form.iconHint")}
                  </FieldDescription>
                  {invalid && (
                    <FieldError>{t("sponsors.form.iconError")}</FieldError>
                  )}
                </Field>
              );
            }}
          </form.Field>
        </FieldGroup>
        <details className="text-sm">
          <summary className="focus-visible:outline-ring cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-offset-4">
            {t("sponsors.form.preview")}
          </summary>
          <div className="mt-3 flex items-start gap-3">
            {preview && (
              <img
                src={preview}
                alt=""
                className="size-10 shrink-0 object-contain"
              />
            )}
            <form.Subscribe
              selector={(s) => [s.values.name, s.values.description]}
            >
              {([name, description]) => (
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-bold wrap-anywhere">
                    {name || t("sponsors.form.namePlaceholder")}
                  </p>
                  <p className="text-muted-foreground text-xs wrap-anywhere">
                    {description || t("sponsors.form.descriptionPlaceholder")}
                  </p>
                </div>
              )}
            </form.Subscribe>
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            {t("sponsors.form.previewHint")}
          </p>
        </details>
      </div>
      <div className="mt-5 flex flex-col gap-3">
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
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={cancelling || !pending.checkoutUrl}
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
        {(!checkoutEnabled || availableSpots === 0) && (
          <p className="text-muted-foreground text-sm">
            {t(
              availableSpots === 0 && checkoutEnabled
                ? "sponsors.soldOut"
                : "sponsors.bookingUnavailable",
            )}
          </p>
        )}
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(submitting) => (
            <Button
              className="w-full"
              type="submit"
              disabled={
                submitting ||
                !checkoutEnabled ||
                availableSpots === 0 ||
                pending !== null
              }
            >
              {submitting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <ArrowRightIcon data-icon="inline-start" />
              )}
              {t(
                submitting
                  ? "sponsors.preparingCheckout"
                  : "sponsors.payWithStripe",
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
