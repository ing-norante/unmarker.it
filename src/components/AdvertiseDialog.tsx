import { lazy, Suspense } from "react";
import { MegaphoneIcon } from "@phosphor-icons/react/dist/ssr/Megaphone";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { sponsorship, TOTAL_SPONSOR_SLOTS } from "@/lib/sponsors";
import { useTranslation } from "react-i18next";
import { trackSponsorEvent } from "@/lib/analytics";

const SponsorBookingForm = lazy(
  () => import("@/components/SponsorBookingForm"),
);

export function AdvertiseDialog({
  availableSpots,
  totalSpots = TOTAL_SPONSOR_SLOTS,
  compact = false,
  checkoutEnabled = false,
  testMode = false,
}: {
  availableSpots: number;
  totalSpots?: number;
  compact?: boolean;
  checkoutEnabled?: boolean;
  testMode?: boolean;
}) {
  const { t, i18n } = useTranslation("common");
  const price = new Intl.NumberFormat(i18n.resolvedLanguage ?? "en", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(sponsorship.priceEur);
  return (
    <Dialog
      onOpenChange={(open) => {
        if (open)
          trackSponsorEvent("sponsor_advertise_opened", {
            available_spots: availableSpots,
            price_eur: sponsorship.priceEur,
            duration_days: sponsorship.durationDays,
          });
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size={compact ? "xs" : "sm"}>
          <MegaphoneIcon data-icon="inline-start" />
          {t("sponsors.advertise")}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        closeLabel={t("sponsors.close")}
      >
        <DialogHeader className="pr-6">
          <DialogTitle>{t("sponsors.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("sponsors.dialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 border-b pb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-semibold">
              {t("sponsors.monthlyPrice", {
                price,
                days: sponsorship.durationDays,
              })}
            </p>
            <p className="text-muted-foreground text-xs">
              {t("sponsors.spotsLeft", {
                available: availableSpots,
                total: totalSpots,
              })}
            </p>
          </div>
          <div className="text-muted-foreground space-y-1 text-xs leading-relaxed">
            <p>{t("sponsors.onePayment")}</p>
            <p>
              {t("sponsors.durationDescription", {
                days: sponsorship.durationDays,
              })}
            </p>
          </div>
          {testMode && (
            <p className="text-primary-text text-xs font-semibold">
              {t("sponsors.testMode")}
            </p>
          )}
        </div>
        <Suspense
          fallback={
            <div className="flex justify-center p-8" role="status">
              <Spinner />
              <span className="sr-only">{t("generic.loading")}</span>
            </div>
          }
        >
          <SponsorBookingForm
            checkoutEnabled={checkoutEnabled}
            availableSpots={availableSpots}
          />
        </Suspense>
        <details className="text-muted-foreground text-xs">
          <summary className="cursor-pointer font-semibold">
            {t("sponsors.howItWorks")}
          </summary>
          <p className="mt-2">{t("sponsors.howItWorksDescription")}</p>
        </details>
      </DialogContent>
    </Dialog>
  );
}
