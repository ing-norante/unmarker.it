import { MegaphoneIcon } from "@phosphor-icons/react/dist/ssr/Megaphone";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/i18n/LocaleProvider";
import { pagePath } from "@/i18n/locales";
import {
  trackSponsorshipLink,
  type SponsorshipLinkLocation,
} from "@/lib/analytics";

export function AdvertiseLink({
  availableSpots,
  location,
  compact = false,
}: {
  availableSpots?: number;
  location: SponsorshipLinkLocation;
  compact?: boolean;
}) {
  const { t } = useTranslation("common");
  const { locale } = useLocale();
  return (
    <Button asChild variant="ghost" size={compact ? "xs" : "sm"}>
      <a
        href={pagePath(locale, "sponsorship")}
        onClick={(event) =>
          trackSponsorshipLink(location, locale, event, availableSpots)
        }
        onAuxClick={(event) => {
          if (event.button === 1)
            trackSponsorshipLink(location, locale, event, availableSpots);
        }}
      >
        <MegaphoneIcon data-icon="inline-start" />
        {t("sponsors.advertise")}
      </a>
    </Button>
  );
}
