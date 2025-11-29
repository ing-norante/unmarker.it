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
    <div className="w-full space-y-4">
      {steps.map((step) => (
        <Card
          key={step.id}
          className={cn(
            "neobrutalist-card border-2 shadow-[4px_4px_0px_0px_rgba(var(--neo-shadow),1)]",
            step.status === "running"
              ? "bg-background"
              : "bg-background opacity-90",
          )}
        >
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <StepIcon status={step.status} />
                <span className="font-bold tracking-wide uppercase">
                  {step.label}
                </span>
              </div>
              <Badge
                variant="neobrutalist"
                className={cn(
                  step.status === "idle" &&
                    "bg-background text-foreground border-foreground/50",
                  step.status === "running" &&
                    "animate-pulse bg-yellow-300 text-black dark:bg-yellow-400",
                  step.status === "done" &&
                    "bg-green-400 text-black dark:bg-green-500",
                  step.status === "error" &&
                    "bg-red-400 text-white dark:bg-red-500",
                )}
              >
                {step.status}
              </Badge>
            </div>

            <div className="space-y-1">
              <Progress
                value={step.progress}
                className="border-foreground h-3 border-2"
              />
              {step.description && (
                <p className="text-foreground/70 font-mono text-xs font-medium tracking-wide">
                  {step.description}
                </p>
              )}
            </div>
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
        <div className="bg-foreground text-background rounded-full p-1">
          <Check className="h-4 w-4" />
        </div>
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
