import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import {
  CRUSH_QUALITY_MAX,
  CRUSH_QUALITY_MIN,
} from "@/lib/pipeline";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("workflow");
  const percent = Math.round(value * 100);

  return (
    <Card size="sm" className="bg-card/95 mt-2 border py-0">
      <CardContent className="flex flex-col gap-3 p-3 lg:p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-foreground text-ui-title">
            {t("quality.title")}
          </span>
          <span className="text-muted-foreground text-ui-body font-bold tabular-nums">
            {percent}%
          </span>
        </div>
        <p className="text-muted-foreground text-ui-body">
          {t("quality.description")}
        </p>
        <Slider
          min={MIN_PERCENT}
          max={MAX_PERCENT}
          step={1}
          value={[percent]}
          onValueChange={([next]) => onChange(next / 100)}
          disabled={disabled}
          aria-label={t("quality.aria")}
        />
        <div className="text-muted-foreground text-ui-caption flex justify-between">
          <span>{t("quality.compression")}</span>
          <span>{t("quality.detail")}</span>
        </div>
      </CardContent>
    </Card>
  );
}
