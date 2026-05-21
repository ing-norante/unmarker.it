import { Button } from "./ui/button";
import { FileImage, RefreshCcw, XCircle, Zap } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { cn } from "@/lib/utils";

interface ActionBarProps {
  fileName: string;
  isProcessing: boolean;
  hasProcessedImage: boolean;
  onReset: () => void;
  onCancel: () => void;
  onProcess: () => void;
  className?: string;
}

export function ActionBar({
  fileName,
  isProcessing,
  hasProcessedImage,
  onReset,
  onCancel,
  onProcess,
  className,
}: ActionBarProps) {
  const posthog = usePostHog();

  const handleReset = () => {
    posthog?.capture("action_clicked", {
      action: "reset",
      component: "action_bar",
    });
    onReset();
  };

  const handleProcess = () => {
    posthog?.capture("action_clicked", {
      action: "process_image",
      component: "action_bar",
    });
    onProcess();
  };

  const handleCancel = () => {
    posthog?.capture("action_clicked", {
      action: "cancel_processing",
      component: "action_bar",
    });
    onCancel();
  };

  return (
    <div
      className={cn(
        "bg-card/90 ring-border/70 text-card-foreground flex flex-col justify-between gap-4 rounded-xl p-3 ring-1 backdrop-blur lg:sticky lg:top-0 lg:z-10 lg:flex-row lg:items-center",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
          <FileImage className="size-4" />
        </span>
        <span className="truncate">{fileName}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {isProcessing && (
          <Button variant="destructive" onClick={handleCancel}>
            <XCircle className="mr-2 h-4 w-4" /> Cancel
          </Button>
        )}
        <Button variant="outline" onClick={handleReset} disabled={isProcessing}>
          <RefreshCcw className="mr-2 h-4 w-4" /> Reset
        </Button>
        <Button
          onClick={handleProcess}
          disabled={isProcessing || hasProcessedImage}
          className={hasProcessedImage ? "opacity-50" : ""}
        >
          <Zap className="mr-2 h-4 w-4" />
          {isProcessing ? "Processing..." : "UnmarkIt!"}
        </Button>
      </div>
    </div>
  );
}
