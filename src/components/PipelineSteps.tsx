import React from "react";
import type { PipelineStepState } from "@/lib/types";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  Loader2,
  RefreshCcw,
  ScanSearch,
  Search,
  Sparkles,
  Waves,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PipelineStepsProps {
  steps: PipelineStepState[];
}

export const PipelineSteps: React.FC<PipelineStepsProps> = ({ steps }) => {
  return (
    <div className="w-full space-y-2">
      {steps.map((step) => (
        <Card
          key={step.id}
          size="sm"
          className={cn(
            "bg-card/95 overflow-hidden border py-0 transition-colors",
            step.status === "running"
              ? "border-primary bg-primary/10"
              : "hover:bg-muted/40",
          )}
        >
          <CardContent className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-2.5 p-2.5 sm:grid-cols-[3.25rem_minmax(0,1fr)_4.35rem] sm:gap-3">
            <div className="bg-muted text-foreground flex size-12 items-center justify-center border">
              <StepGlyph id={step.id} status={step.status} />
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-foreground truncate text-[0.84rem] font-extrabold tracking-[-0.02em]">
                  {step.label}
                </span>
                {step.status === "done" && (
                  <Check className="text-chart-2 size-4 shrink-0" />
                )}
              </div>
              {step.description && (
                <p className="text-muted-foreground line-clamp-2 text-[0.68rem] leading-tight font-medium">
                  {step.description}
                </p>
              )}
            </div>

            <StatusBadge status={step.status} />
            {step.status === "running" && (
              <Progress className="col-span-full h-1" value={step.progress} />
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
    return <Loader2 className="size-6 animate-spin" strokeWidth={2.2} />;
  }

  if (status === "error") {
    return <X className="text-destructive size-6" strokeWidth={2.2} />;
  }

  switch (id) {
    case "gemini-detect":
      return <Search className="size-6" strokeWidth={2.2} />;
    case "gemini-restore":
      return <RefreshCcw className="size-6" strokeWidth={2.2} />;
    case "shake":
      return <ScanSearch className="size-6" strokeWidth={2.2} />;
    case "stir":
      return <Waves className="size-6" strokeWidth={2.2} />;
    case "crush":
      return <Sparkles className="size-6" strokeWidth={2.2} />;
  }
}

function StatusBadge({ status }: { status: PipelineStepState["status"] }) {
  switch (status) {
    case "done":
      return (
        <Badge className="border-chart-2/20 bg-chart-2/10 text-chart-2 justify-self-start text-[0.64rem] font-bold uppercase sm:justify-self-end">
          <span className="bg-chart-2 size-1.5" />
          Done
        </Badge>
      );
    case "skipped":
      return (
        <Badge
          variant="outline"
          className="bg-muted text-muted-foreground justify-self-start text-[0.64rem] font-bold uppercase sm:justify-self-end"
        >
          <span className="bg-muted-foreground/40 size-1.5" />
          Skip
        </Badge>
      );
    case "running":
      return (
        <Badge className="border-primary/30 bg-primary/10 text-primary justify-self-start text-[0.64rem] font-bold uppercase sm:justify-self-end">
          <span className="bg-primary size-1.5 animate-pulse" />
          Run
        </Badge>
      );
    case "error":
      return (
        <Badge
          variant="destructive"
          className="justify-self-start text-[0.64rem] font-bold uppercase sm:justify-self-end"
        >
          <span className="bg-destructive size-1.5" />
          Error
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className="bg-muted/60 text-muted-foreground justify-self-start text-[0.64rem] font-bold uppercase sm:justify-self-end"
        >
          <span className="bg-muted-foreground/30 size-1.5" />
          Idle
        </Badge>
      );
  }
}
