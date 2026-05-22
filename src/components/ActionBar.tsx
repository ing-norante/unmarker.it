import { Button } from "./ui/button";
import {
  ArrowClockwiseIcon,
  FileImageIcon,
  LightningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { Spinner } from "./ui/spinner";
import { usePostHog } from "posthog-js/react";
import { trackAction } from "@/lib/analytics";
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
    trackAction(posthog, "reset", "action_bar");
    onReset();
  };

  const handleProcess = () => {
    trackAction(posthog, "process_image", "action_bar");
    onProcess();
  };

  const handleCancel = () => {
    trackAction(posthog, "cancel_processing", "action_bar");
    onCancel();
  };

  return (
    <div
      className={cn(
        "bg-card/95 text-card-foreground flex flex-col justify-between gap-4 border p-4 lg:sticky lg:top-0 lg:z-10 lg:flex-row lg:items-center",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium sm:text-base">
        <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center border">
          <FileImageIcon className="size-4" weight="bold" />
        </span>
        <span className="truncate">{fileName}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {isProcessing && (
          <Button variant="destructive" onClick={handleCancel}>
            <XCircleIcon data-icon="inline-start" />
            Cancel
          </Button>
        )}
        <Button variant="outline" onClick={handleReset} disabled={isProcessing}>
          <ArrowClockwiseIcon data-icon="inline-start" />
          Reset
        </Button>
        <Button
          onClick={handleProcess}
          disabled={isProcessing || hasProcessedImage}
          className={cn("font-black", hasProcessedImage && "opacity-50")}
        >
          {isProcessing ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <LightningIcon data-icon="inline-start" />
          )}
          {isProcessing ? "Processing..." : "UnmarkIt!"}
        </Button>
      </div>
    </div>
  );
}
