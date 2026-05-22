import { Button } from "./ui/button";
import {
  ArrowClockwiseIcon,
  DownloadSimpleIcon,
  FileImageIcon,
  FileSearchIcon,
  LightningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { Spinner } from "./ui/spinner";
import { trackAction } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import type { WorkflowPhase } from "@/lib/types";

interface ActionBarProps {
  fileName: string;
  phase: WorkflowPhase;
  hasProcessedImage: boolean;
  processedImageUrl: string | null;
  processedFileName: string | null;
  canCleanMetadata: boolean;
  isMetadataCleaning: boolean;
  canProcess: boolean;
  onReset: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onReprocess: () => void;
  onDownloadCleanMetadata: () => void;
  className?: string;
}

export function ActionBar({
  fileName,
  phase,
  hasProcessedImage,
  processedImageUrl,
  processedFileName,
  canCleanMetadata,
  isMetadataCleaning,
  canProcess,
  onReset,
  onCancel,
  onRetry,
  onReprocess,
  onDownloadCleanMetadata,
  className,
}: ActionBarProps) {
  const isBusy =
    phase === "preflight-scanning" ||
    phase === "processing" ||
    phase === "postflight-scanning";
  const canCancel =
    phase === "preflight-scanning" ||
    phase === "processing" ||
    phase === "postflight-scanning";
  const canRetry = phase === "error" || (phase === "cancelled" && canProcess);
  const canReprocess = phase === "complete" && canProcess;

  const handleReset = () => {
    trackAction("reset", "action_bar");
    onReset();
  };

  const handleRetry = () => {
    trackAction("process_image", "action_bar");
    onRetry();
  };

  const handleReprocess = () => {
    trackAction("reprocess_started", "action_bar");
    onReprocess();
  };

  const handleCancel = () => {
    trackAction("cancel_processing", "action_bar");
    onCancel();
  };

  const handleDownload = () => {
    trackAction("download_processed", "action_bar");
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
        {canCancel && (
          <Button variant="destructive" onClick={handleCancel}>
            <XCircleIcon data-icon="inline-start" />
            Cancel
          </Button>
        )}
        <Button variant="outline" onClick={handleReset} disabled={isBusy}>
          <ArrowClockwiseIcon data-icon="inline-start" />
          Reset
        </Button>
        {canRetry && (
          <Button onClick={handleRetry} className="font-black">
            <LightningIcon data-icon="inline-start" />
            Retry
          </Button>
        )}
        {canReprocess && (
          <Button onClick={handleReprocess} className="font-black">
            <LightningIcon data-icon="inline-start" />
            Reprocess
          </Button>
        )}
        {processedImageUrl && hasProcessedImage && (
          <Button asChild>
            <a
              href={processedImageUrl}
              download={processedFileName ?? undefined}
              onClick={handleDownload}
            >
              <DownloadSimpleIcon data-icon="inline-start" />
              Download JPEG
            </a>
          </Button>
        )}
        {canCleanMetadata && (
          <Button
            variant="outline"
            onClick={onDownloadCleanMetadata}
            disabled={isBusy || isMetadataCleaning}
          >
            {isMetadataCleaning ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <FileSearchIcon data-icon="inline-start" />
            )}
            Clean metadata
          </Button>
        )}
      </div>
    </div>
  );
}
