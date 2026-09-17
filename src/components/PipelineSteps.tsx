import React from "react";
import type { PipelineStepState } from "@/lib/types";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  ArrowClockwiseIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  ScanIcon,
  SparkleIcon,
  WavesIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface PipelineStepsProps {
  steps: PipelineStepState[];
}

export const PipelineSteps: React.FC<PipelineStepsProps> = ({ steps }) => {
  const { t } = useTranslation("workflow");
  return (
    <div className="flex w-full flex-col gap-2">
      {steps.map((step) => (
        <Card
          key={step.id}
          size="sm"
          className={cn(
            "bg-card/95 overflow-visible border py-0 transition-colors",
            step.status === "running" && "border-primary bg-primary/10",
          )}
        >
          <CardContent className="flex flex-col gap-2 p-3 lg:p-3.5">
            <div className="flex items-start gap-2.5 sm:gap-3">
              <div className="text-muted-foreground flex size-8 shrink-0 items-center justify-center">
                <StepGlyph id={step.id} status={step.status} />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-foreground text-ui-title">
                      {t(`steps.${step.id}.label`)}
                    </span>
                    {step.status === "done" && (
                      <CheckIcon
                        className="text-primary-text size-4 shrink-0"
                        weight="bold"
                      />
                    )}
                  </div>
                  <StatusBadge
                    status={step.status}
                    label={t(`stepStatus.${step.status}`)}
                  />
                </div>
                <p className="text-muted-foreground text-ui-body text-pretty wrap-break-word">
                  {t(`steps.${step.id}.description`)}
                </p>
              </div>
            </div>

            {step.status === "running" && (
              <Progress
                className="h-1 w-full"
                value={step.progress}
                aria-label={t(`steps.${step.id}.label`)}
              />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

function StepGlyph({
  id,
  status,
}: {
  id: PipelineStepState["id"];
  status: PipelineStepState["status"];
}) {
  if (status === "running") {
    return <Spinner className="size-6" />;
  }

  if (status === "error") {
    return <XIcon className="text-destructive-text size-6" weight="bold" />;
  }

  switch (id) {
    case "gemini-detect":
      return <MagnifyingGlassIcon className="size-6" weight="bold" />;
    case "gemini-restore":
      return <ArrowClockwiseIcon className="size-6" weight="bold" />;
    case "shake":
      return <ScanIcon className="size-6" weight="bold" />;
    case "stir":
      return <WavesIcon className="size-6" weight="bold" />;
    case "crush":
      return <SparkleIcon className="size-6" weight="bold" />;
  }
}

function StatusBadge({
  status,
  label,
}: {
  status: PipelineStepState["status"];
  label: string;
}) {
  const variant =
    status === "error"
      ? "destructive"
      : status === "done" || status === "running"
        ? "default"
        : "secondary";

  return (
    <Badge variant={variant}>
      {status === "running" && <Spinner data-icon="inline-start" />}
      {label}
    </Badge>
  );
}
