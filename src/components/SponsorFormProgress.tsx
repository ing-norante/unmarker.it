import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function SponsorFormProgress({ step }: { step: 1 | 2 }) {
  const { t } = useTranslation("common");
  return (
    <div className="mb-6 flex flex-col gap-3">
      <ol
        aria-label={t("sponsors.form.stepsLabel")}
        className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,5rem),1fr))] gap-3 text-sm leading-normal wrap-anywhere tabular-nums"
      >
        {(["creative", "billing", "payment"] as const).map((key, index) => (
          <li
            key={key}
            aria-current={step === index + 1 ? "step" : undefined}
            className={cn(
              "text-muted-foreground",
              step === index + 1 && "text-primary-text font-semibold",
            )}
          >
            {index + 1}. {t(`sponsors.form.steps.${key}`)}
          </li>
        ))}
      </ol>
      <Progress
        value={(step / 3) * 100}
        aria-label={t("sponsors.form.stepsLabel")}
        getValueLabel={() => t("sponsors.form.stepOf", { step, total: 3 })}
      />
    </div>
  );
}
