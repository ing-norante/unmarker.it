import { Badge } from "@/components/ui/badge";
import type { MetadataScanResult, MetadataSignalType } from "@/lib/types";

interface MetadataSignalsListProps {
  scanResult: MetadataScanResult | null;
  emptyCopy?: string;
}

const CATEGORY_LABELS: Record<MetadataSignalType, string> = {
  c2pa: "C2PA",
  xmp: "XMP AI marker",
  exif: "EXIF",
  "png-text": "PNG text",
  "webp-metadata": "WebP metadata",
  "isobmff-box": "ISOBMFF/JUMBF",
  "binary-marker": "Binary marker",
};

export function MetadataSignalsList({
  scanResult,
  emptyCopy = "No metadata signals found.",
}: MetadataSignalsListProps) {
  const categories = scanResult
    ? [
        ...new Set(
          scanResult.signals.map((signal) => CATEGORY_LABELS[signal.type]),
        ),
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="text-ui-overline">Metadata categories</h3>
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
            {emptyCopy}
          </p>
        )}
      </section>

      {scanResult && scanResult.signals.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-ui-overline">Signals</h3>
          <div className="flex flex-col gap-2">
            {scanResult.signals.map((signal, index) => (
              <div
                key={`${signal.location}-${signal.marker ?? signal.label}-${index}`}
                className="bg-muted/40 flex min-w-0 flex-col gap-1 border p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold sm:text-base">
                    {signal.label}
                  </span>
                  <Badge variant={signal.removable ? "default" : "outline"}>
                    {signal.removable ? "removable" : "scan only"}
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
          <h3 className="text-ui-overline">Warnings</h3>
          <ul className="flex flex-col gap-2">
            {scanResult.warnings.map((warning) => (
              <li
                key={warning}
                className="bg-muted/50 text-muted-foreground border p-2 text-sm sm:text-base"
              >
                {warning}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
