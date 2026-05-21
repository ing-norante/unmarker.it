import React from "react";
import type { PipelineStepState } from "@/lib/types";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PipelineStepsProps {
  steps: PipelineStepState[];
}

export const PipelineSteps: React.FC<PipelineStepsProps> = ({ steps }) => {
  return (
    <div className="w-full space-y-2.5">
      {steps.map((step) => {
        const isActive =
          step.status === "running" ||
          step.status === "done" ||
          step.status === "error";

        return (
          <Card
            key={step.id}
            className={cn(
              "border-2 shadow-[3px_3px_0px_0px_rgba(var(--neo-shadow),1)] transition-shadow",
              step.status === "running"
                ? "bg-background ring-2 ring-yellow-300"
                : "bg-background/95",
            )}
          >
            <CardContent className="flex flex-col gap-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <StepIcon status={step.status} />
                  <span className="truncate text-sm font-bold tracking-wide uppercase">
                    {step.label}
                  </span>
                </div>
                <Badge
                  variant="neobrutalist"
                  className={cn(
                    "shrink-0 text-[10px] uppercase",
                    step.status === "idle" &&
                      "bg-background text-foreground border-foreground/50",
                    step.status === "running" &&
                      "animate-pulse bg-yellow-300 text-black dark:bg-yellow-400",
                    step.status === "done" &&
                      "bg-green-400 text-black dark:bg-green-500",
                    step.status === "skipped" &&
                      "bg-muted text-muted-foreground border-foreground/50",
                    step.status === "error" &&
                      "bg-red-400 text-white dark:bg-red-500",
                  )}
                >
                  {step.status}
                </Badge>
              </div>

              <Progress
                value={step.progress}
                className="border-foreground h-2 border-2"
              />

              {step.description && (
                <p
                  className={cn(
                    "text-foreground/70 font-mono text-[11px] leading-snug font-medium tracking-wide",
                    !isActive && "line-clamp-2",
                  )}
                >
                  {step.description}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

const StepIcon = ({ status }: { status: PipelineStepState["status"] }) => {
  switch (status) {
    case "done":
      return (
        <div className="bg-foreground text-background rounded-full p-1">
          <Check className="h-4 w-4" />
        </div>
      );
    case "skipped":
      return (
        <div className="border-foreground h-6 w-6 rounded-full border-2 opacity-60" />
      );
    case "running":
      return <Loader2 className="h-6 w-6 animate-spin" />;
    case "error":
      return (
        <div className="rounded-full bg-red-500 p-1 text-white">
          <X className="h-4 w-4" />
        </div>
      );
    default:
      return (
        <div className="border-foreground h-6 w-6 rounded-full border-2" />
      );
  }
};
