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
    <div className="space-y-4 w-full">
      {steps.map((step) => (
        <Card
          key={step.id}
          className={cn(
            "neobrutalist-card border-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
            step.status === "running" ? "bg-white" : "bg-gray-50 opacity-80"
          )}
        >
          <CardContent className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <StepIcon status={step.status} />
                <span className="font-bold uppercase tracking-wide">
                  {step.label}
                </span>
              </div>
              <Badge
                variant="neobrutalist"
                className={cn(
                  step.status === "idle" && "bg-gray-200",
                  step.status === "running" && "bg-yellow-300 animate-pulse",
                  step.status === "done" && "bg-green-400",
                  step.status === "error" && "bg-red-400"
                )}
              >
                {step.status}
              </Badge>
            </div>

            <div className="space-y-1">
              <Progress
                value={step.progress}
                className="h-3 border-2 border-black"
              />
              {step.description && (
                <p className="text-xs text-muted-foreground font-mono">
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
        <div className="bg-black text-white p-1 rounded-full">
          <Check className="w-4 h-4" />
        </div>
      );
    case "running":
      return <Loader2 className="w-6 h-6 animate-spin" />;
    case "error":
      return (
        <div className="bg-red-500 text-white p-1 rounded-full">
          <X className="w-4 h-4" />
        </div>
      );
    default:
      return <div className="w-6 h-6 rounded-full border-2 border-gray-300" />;
  }
};
