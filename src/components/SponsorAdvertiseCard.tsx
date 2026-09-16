import { AdvertiseDialog } from "@/components/AdvertiseDialog";
import { TOTAL_SPONSOR_SLOTS } from "@/lib/sponsors";
import { useTranslation } from "react-i18next";

export function SponsorAdvertiseCard({
  availableSpots,
  totalSpots = TOTAL_SPONSOR_SLOTS,
  checkoutEnabled = false,
  testMode = false,
}: {
  availableSpots: number;
  totalSpots?: number;
  checkoutEnabled?: boolean;
  testMode?: boolean;
}) {
  const { t } = useTranslation("common");
  return (
    <div className="border-primary/30 bg-primary/5 hover:border-primary flex h-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 text-center transition-colors">
      <AdvertiseDialog
        availableSpots={availableSpots}
        totalSpots={totalSpots}
        checkoutEnabled={checkoutEnabled}
        testMode={testMode}
      />
      <p className="text-muted-foreground text-xs">
        {t("sponsors.spotsLeft", {
          available: availableSpots,
          total: totalSpots,
        })}
      </p>
    </div>
  );
}
