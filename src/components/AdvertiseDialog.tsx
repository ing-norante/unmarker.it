import { lazy, Suspense } from "react";
import { MegaphoneIcon } from "@phosphor-icons/react/dist/ssr/Megaphone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        closeLabel={t("sponsors.close")}
      >
        <DialogHeader>
          <DialogTitle>{t("sponsors.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("sponsors.dialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>
            {t("sponsors.monthlyPrice", {
              price,
              days: sponsorship.durationDays,
            })}
          </Badge>
          <Badge variant="secondary">{t("sponsors.onePayment")}</Badge>
          <Badge variant="outline">
            {t("sponsors.spotsLeft", {
              available: availableSpots,
              total: totalSpots,
            })}
          </Badge>
          {testMode && (
            <Badge variant="outline">{t("sponsors.testMode")}</Badge>
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
