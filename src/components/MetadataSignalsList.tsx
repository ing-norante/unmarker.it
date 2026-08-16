import { Badge } from "@/components/ui/badge";
import type { MetadataScanResult } from "@/lib/types";
import { useTranslation } from "react-i18next";
import { messageId, translateMessage } from "@/i18n/messages";
import { metadataWarningId, translateMetadataWarning } from "@/i18n/metadata";

interface MetadataSignalsListProps {
  scanResult: MetadataScanResult | null;
  emptyCopy?: string;
}

export function MetadataSignalsList({
  scanResult,
  emptyCopy,
}: MetadataSignalsListProps) {
  const { t } = useTranslation("metadata");
  const categories = scanResult
    ? [
        ...new Set(
          scanResult.signals.map((signal) => t(`categories.${signal.type}`)),
        ),
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="text-ui-overline">{t("panel.categories")}</h3>
        {categories.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Badge key={category} variant="secondary">
                {category}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground border border-dashed p-3 text-sm sm:text-base">
            {emptyCopy ?? t("panel.empty")}
          </p>
        )}
      </section>

      {scanResult && scanResult.signals.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-ui-overline">{t("panel.signals")}</h3>
          <div className="flex flex-col gap-2">
            {scanResult.signals.map((signal, index) => (
              <div
                key={`${signal.location}-${signal.marker ?? messageId(signal.label)}-${index}`}
                className="bg-muted/40 flex min-w-0 flex-col gap-1 border p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold sm:text-base">
                    {translateMessage(t, signal.label)}
                  </span>
                  <Badge variant={signal.removable ? "default" : "outline"}>
                    {signal.removable ? t("panel.removable") : t("panel.scanOnlyBadge")}
                  </Badge>
                </div>
                <p className="text-muted-foreground truncate font-mono text-xs sm:text-sm">
                  {signal.location}
                  {signal.marker ? ` / ${signal.marker}` : ""}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {scanResult && scanResult.warnings.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-ui-overline">{t("panel.warnings")}</h3>
          <ul className="flex flex-col gap-2">
            {scanResult.warnings.map((warning) => (
              <li
                key={metadataWarningId(warning)}
                className="bg-muted/50 text-muted-foreground border p-2 text-sm sm:text-base"
              >
                {translateMetadataWarning(t, warning)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
