import { AdvertiseLink } from "@/components/AdvertiseLink";
import { TOTAL_SPONSOR_SLOTS } from "@/lib/sponsors";
import { useTranslation } from "react-i18next";

export function SponsorAdvertiseCard({
  availableSpots,
  location,
  totalSpots = TOTAL_SPONSOR_SLOTS,
}: {
  availableSpots?: number;
  location: "desktop_left_card" | "desktop_right_card";
  totalSpots?: number;
}) {
  const { t } = useTranslation("common");
  return (
    <div className="border-primary/30 bg-primary/5 hover:border-primary flex h-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 text-center transition-colors">
      <AdvertiseLink availableSpots={availableSpots} location={location} />
      {availableSpots !== undefined && (
        <p className="text-muted-foreground text-xs">
          {t("sponsors.spotsLeft", {
            available: availableSpots,
            total: totalSpots,
          })}
        </p>
      )}
    </div>
  );
}
