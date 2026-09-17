import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import SponsorBookingForm from "@/components/SponsorBookingForm";
import { CookieConsent } from "@/components/CookieConsent";
import { Footer } from "@/components/Footer";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useSponsorCatalog } from "@/hooks/useSponsorCatalog";
import { useLocale } from "@/i18n/LocaleProvider";
import { localeConfigs } from "@/i18n/locales";
import { sponsorship, TOTAL_SPONSOR_SLOTS } from "@/lib/sponsors";

export default function SponsorshipPage() {
  const { t, i18n } = useTranslation("common");
  const { locale } = useLocale();
  const {
    availableSpots,
    checkoutEnabled,
    testMode,
    status,
    refreshing,
    retry,
  } = useSponsorCatalog();
  const totalSpots = TOTAL_SPONSOR_SLOTS;
  const price = new Intl.NumberFormat(i18n.resolvedLanguage ?? "en", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(sponsorship.priceEur);

  return (
    <div className="sponsorship-page bg-background text-foreground min-h-dvh px-(--page-gutter) py-6 font-sans sm:py-10">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <a
          href={localeConfigs[locale].path}
          className="text-xl font-black underline-offset-4 hover:underline"
        >
          UNMARKER.IT
        </a>
        <LanguageSwitcher page="sponsorship" />
      </header>
      <main className="mx-auto my-10 w-full max-w-xl space-y-6 sm:my-16">
        <div className="space-y-2">
          <h1 className="sponsorship-title">{t("sponsors.dialogTitle")}</h1>
          <p className="sponsorship-copy text-muted-foreground">
            {t("sponsors.dialogDescription")}
          </p>
        </div>
        <div className="space-y-2 border-b pb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="sponsorship-price">
              {t("sponsors.monthlyPrice", {
                price,
                days: sponsorship.durationDays,
              })}
            </p>
            <p
              className="text-muted-foreground text-sm leading-relaxed tabular-nums"
              role="status"
              aria-atomic="true"
            >
              {status === "ready" && availableSpots !== undefined
                ? t("sponsors.spotsLeft", {
                    available: availableSpots,
                    total: totalSpots,
                  })
                : t(
                    status === "loading"
                      ? "sponsors.catalogLoading"
                      : "sponsors.catalogUnknown",
                  )}
            </p>
          </div>
          <div className="text-muted-foreground space-y-1 text-sm leading-relaxed">
            <p>{t("sponsors.onePayment")}</p>
            <p>
              {t("sponsors.durationDescription", {
                days: sponsorship.durationDays,
              })}
            </p>
          </div>
          {status === "error" && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-muted-foreground text-sm" role="alert">
                {t("sponsors.catalogError")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={retry}
                disabled={refreshing}
              >
                {t(
                  refreshing
                    ? "sponsors.catalogLoading"
                    : "sponsors.catalogRetry",
                )}
              </Button>
            </div>
          )}
          {testMode && (
            <p className="text-primary-text text-xs font-semibold">
              {t("sponsors.testMode")}
            </p>
          )}
        </div>
        <SponsorBookingForm
          checkoutEnabled={checkoutEnabled}
          availableSpots={availableSpots}
          catalogStatus={status}
        />
        <details className="text-muted-foreground text-sm leading-relaxed">
          <summary className="cursor-pointer font-semibold">
            {t("sponsors.howItWorks")}
          </summary>
          <p className="sponsorship-copy mt-2">
            {t("sponsors.howItWorksDescription")}
          </p>
        </details>
      </main>
      <div className="mx-auto max-w-6xl">
        <Footer />
      </div>
      <CookieConsent />
    </div>
  );
}
