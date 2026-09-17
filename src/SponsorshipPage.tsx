import { useTranslation } from "react-i18next";
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
  const { availableSpots, checkoutEnabled, testMode } = useSponsorCatalog();
  const totalSpots = TOTAL_SPONSOR_SLOTS;
  const price = new Intl.NumberFormat(i18n.resolvedLanguage ?? "en", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(sponsorship.priceEur);

  return (
    <div className="bg-background text-foreground min-h-dvh px-(--page-gutter) py-6 font-sans sm:py-10">
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
          <h1 className="text-2xl font-bold">{t("sponsors.dialogTitle")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("sponsors.dialogDescription")}
          </p>
        </div>
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
        <SponsorBookingForm
          checkoutEnabled={checkoutEnabled}
          availableSpots={availableSpots}
        />
        <details className="text-muted-foreground text-xs">
          <summary className="cursor-pointer font-semibold">
            {t("sponsors.howItWorks")}
          </summary>
          <p className="mt-2">{t("sponsors.howItWorksDescription")}</p>
        </details>
      </main>
      <div className="mx-auto max-w-6xl">
        <Footer />
      </div>
      <CookieConsent />
    </div>
  );
}
