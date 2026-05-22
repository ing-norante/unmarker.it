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

interface PipelineStepsProps {
  steps: PipelineStepState[];
}

export const PipelineSteps: React.FC<PipelineStepsProps> = ({ steps }) => {
  return (
    <div className="flex w-full flex-col gap-2">
      {steps.map((step) => (
        <Card
          key={step.id}
          size="sm"
          className={cn(
            "bg-card/95 overflow-visible border py-0 transition-colors",
            step.status === "running"
              ? "border-primary bg-primary/10"
              : "hover:bg-muted/40",
          )}
        >
          <CardContent className="flex flex-col gap-2 p-3 lg:p-3.5">
            <div className="flex items-start gap-2.5 sm:gap-3">
              <div className="bg-muted text-foreground flex size-12 shrink-0 items-center justify-center border">
                <StepGlyph id={step.id} status={step.status} />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-foreground text-ui-title">
                      {step.label}
                    </span>
                    {step.status === "done" && (
                      <CheckIcon
                        className="text-chart-2 size-4 shrink-0"
                        weight="bold"
                      />
                    )}
                  </div>
                  <StatusBadge status={step.status} />
                </div>
                {step.description && (
                  <p className="text-muted-foreground text-ui-body text-pretty wrap-break-word">
                    {step.description}
                  </p>
                )}
              </div>
            </div>

            {step.status === "running" && (
              <Progress className="h-1 w-full" value={step.progress} />
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
    return <XIcon className="text-destructive size-6" weight="bold" />;
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

function StatusBadge({ status }: { status: PipelineStepState["status"] }) {
  switch (status) {
    case "done":
      return (
        <Badge className="border-chart-2/20 bg-chart-2/10 text-chart-2 text-ui-caption shrink-0 font-bold uppercase">
          <span className="bg-chart-2 size-1.5" />
          Done
        </Badge>
      );
    case "skipped":
      return (
        <Badge
          variant="outline"
          className="bg-muted text-muted-foreground text-ui-caption shrink-0 font-bold uppercase"
        >
          <span className="bg-muted-foreground/40 size-1.5" />
          Skip
        </Badge>
      );
    case "running":
      return (
        <Badge className="border-primary/30 bg-primary/10 text-primary text-ui-caption shrink-0 font-bold uppercase">
          <Spinner data-icon="inline-start" />
          Run
        </Badge>
      );
    case "error":
      return (
        <Badge
          variant="destructive"
          className="text-ui-caption shrink-0 font-bold uppercase"
        >
          <span className="bg-destructive size-1.5" />
          Error
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className="bg-muted/60 text-muted-foreground text-ui-caption shrink-0 font-bold uppercase"
        >
          <span className="bg-muted-foreground/30 size-1.5" />
          Idle
        </Badge>
      );
  }
}
