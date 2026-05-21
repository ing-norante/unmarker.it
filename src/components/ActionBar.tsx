import { Button } from "./ui/button";
import { RefreshCcw, XCircle, Zap } from "lucide-react";
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
        "border-foreground bg-background flex flex-col items-center justify-between gap-4 border-2 p-4 shadow-[4px_4px_0px_0px_rgba(var(--neo-shadow),1)] lg:sticky lg:top-0 lg:z-10 lg:flex-row",
        className,
      )}
    >
      <div className="max-w-[200px] truncate font-bold">{fileName}</div>
      <div className="flex gap-2">
        {isProcessing && (
          <Button
            variant="destructive"
            onClick={handleCancel}
            className="border-foreground rounded-none border-2"
          >
            <XCircle className="mr-2 h-4 w-4" /> Cancel
          </Button>
        )}
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={isProcessing}
          className="border-foreground rounded-none border-2 hover:bg-red-100 dark:hover:bg-red-900"
        >
          <RefreshCcw className="mr-2 h-4 w-4" /> Reset
        </Button>
        <Button
          onClick={handleProcess}
          disabled={isProcessing || hasProcessedImage}
          variant="neobrutalist"
          className={hasProcessedImage ? "opacity-50" : ""}
        >
          <Zap className="mr-2 h-4 w-4" />
          {isProcessing ? "Processing..." : "UnmarkIt!"}
        </Button>
      </div>
    </div>
  );
}
