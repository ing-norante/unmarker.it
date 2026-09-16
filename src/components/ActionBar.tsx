import { Button } from "./ui/button";
import { useEffect, useRef } from "react";
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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("common");
  const fileNameRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    fileNameRef.current?.focus({ preventScroll: true });
  }, [fileName]);
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
    onRetry();
  };

  const handleReprocess = () => {
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
        "bg-card/95 text-card-foreground flex flex-col justify-between gap-4 border p-4 lg:sticky lg:top-0 lg:z-10 @min-[52rem]/workspace:flex-row @min-[52rem]/workspace:items-center",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium sm:text-base">
        <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center border">
          <FileImageIcon className="size-4" weight="bold" />
        </span>
        <span ref={fileNameRef} tabIndex={-1} className="truncate focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{fileName}</span>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-2 @min-[28rem]/workspace:flex @min-[28rem]/workspace:flex-wrap [&>[data-slot=button]]:h-auto [&>[data-slot=button]]:min-h-8 [&>[data-slot=button]]:min-w-0 [&>[data-slot=button]]:max-w-full [&>[data-slot=button]]:py-2 [&>[data-slot=button]]:whitespace-normal [&>[data-slot=button]]:wrap-anywhere">
        {canCancel && (
          <Button variant="destructive" onClick={handleCancel}>
            <XCircleIcon data-icon="inline-start" />
            {t("actions.cancel")}
          </Button>
        )}
        <Button variant="outline" onClick={handleReset} disabled={isBusy}>
          <ArrowClockwiseIcon data-icon="inline-start" />
          {t("actions.reset")}
        </Button>
        {canRetry && (
          <Button onClick={handleRetry} className="font-black">
            <LightningIcon data-icon="inline-start" />
            {t("actions.retry")}
          </Button>
        )}
        {canReprocess && (
          <Button onClick={handleReprocess} className="font-black">
            <LightningIcon data-icon="inline-start" />
            {t("actions.reprocess")}
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
              {t("actions.downloadJpeg")}
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
            {t("actions.cleanMetadata")}
          </Button>
        )}
      </div>
    </div>
  );
}
