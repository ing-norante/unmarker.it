import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import {
  CRUSH_QUALITY_MAX,
  CRUSH_QUALITY_MIN,
} from "@/lib/pipeline";

const MIN_PERCENT = Math.round(CRUSH_QUALITY_MIN * 100);
const MAX_PERCENT = Math.round(CRUSH_QUALITY_MAX * 100);

interface CrushQualityControlProps {
  value: number;
  onChange: (quality: number) => void;
  disabled?: boolean;
}

export function CrushQualityControl({
  value,
  onChange,
  disabled = false,
}: CrushQualityControlProps) {
  const percent = Math.round(value * 100);

  return (
    <Card size="sm" className="bg-card/95 mt-2 border py-0">
      <CardContent className="flex flex-col gap-3 p-3 lg:p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-foreground text-ui-title">
            Crush JPEG quality
          </span>
          <span className="text-muted-foreground text-ui-body font-bold tabular-nums">
            {percent}%
          </span>
        </div>
        <p className="text-muted-foreground text-ui-body">
          Lower quality applies more JPEG compression and can remove more
          watermark residue; higher keeps more detail.
        </p>
        <Slider
          min={MIN_PERCENT}
          max={MAX_PERCENT}
          step={1}
          value={[percent]}
          onValueChange={([next]) => onChange(next / 100)}
          disabled={disabled}
          aria-label="JPEG output quality"
        />
        <div className="text-muted-foreground text-ui-caption flex justify-between">
          <span>More compression</span>
          <span>More detail</span>
        </div>
      </CardContent>
    </Card>
  );
}
