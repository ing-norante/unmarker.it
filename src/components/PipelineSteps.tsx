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
    <div className="w-full space-y-3">
      {steps.map((step) => (
        <Card
          key={step.id}
          size="sm"
          className={cn(
            "bg-card/90 ring-border/70 transition-all",
            step.status === "running"
              ? "ring-primary/35 bg-primary/5 ring-2"
              : "hover:ring-foreground/15",
          )}
        >
          <CardContent className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <StepIcon status={step.status} />
                <span className="truncate text-sm font-medium">
                  {step.label}
                </span>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 text-[10px] capitalize",
                  step.status === "idle" && "text-muted-foreground",
                  step.status === "running" &&
                    "border-primary/30 bg-primary/10 text-primary",
                  step.status === "done" &&
                    "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                  step.status === "skipped" && "bg-muted text-muted-foreground",
                  step.status === "error" &&
                    "border-destructive/20 bg-destructive/10 text-destructive",
                )}
              >
                {step.status}
              </Badge>
            </div>

            <Progress value={step.progress} className="h-1.5" />

            {step.description && (
              <p className="text-muted-foreground text-xs leading-relaxed">
                {step.description}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

const StepIcon = ({ status }: { status: PipelineStepState["status"] }) => {
  switch (status) {
    case "done":
      return (
        <div className="rounded-full bg-emerald-500/10 p-1 text-emerald-700 dark:text-emerald-300">
          <Check className="h-4 w-4" />
        </div>
      );
    case "skipped":
      return (
        <div className="border-border bg-muted h-6 w-6 rounded-full border opacity-80" />
      );
    case "running":
      return <Loader2 className="text-primary h-6 w-6 animate-spin" />;
    case "error":
      return (
        <div className="rounded-full bg-red-500 p-1 text-white">
          <X className="h-4 w-4" />
        </div>
      );
    default:
      return (
        <div className="border-border bg-background h-6 w-6 rounded-full border" />
      );
  }
};
