import { Button } from "./ui/button";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
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

const mobileQuery = "(max-width: 1023px)";
const subscribeToViewport = (notify: () => void) => {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const isMobileViewport = () => window.matchMedia(mobileQuery).matches;
const serverViewport = () => false;

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
  const mobile = useSyncExternalStore(
    subscribeToViewport,
    isMobileViewport,
    serverViewport,
  );
  const actionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mobile || !actionsRef.current) return;
    const root = document.documentElement;
    const updateHeight = () => {
      root.style.setProperty(
        "--workflow-toolbar-height",
        `${actionsRef.current?.getBoundingClientRect().height ?? 0}px`,
      );
    };
    const observer = new ResizeObserver(updateHeight);
    observer.observe(actionsRef.current);
    updateHeight();
    return () => {
      observer.disconnect();
      root.style.removeProperty("--workflow-toolbar-height");
    };
  }, [mobile]);
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

  const canDownload = !!processedImageUrl && hasProcessedImage;
  const metadataAction = canCleanMetadata && (
    <Button
      variant={!canProcess && !canDownload ? "default" : "outline"}
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
  );
  const actions = (
    <div
      ref={actionsRef}
      role="group"
      aria-label={t("actions.imageActions")}
      className={cn(
        "workflow-actions",
        mobile ? "workflow-actions-mobile" : "flex min-w-0 flex-wrap gap-2",
      )}
    >
      <Button variant="outline" onClick={handleReset} disabled={isBusy}>
        <ArrowClockwiseIcon data-icon="inline-start" />
        {t("actions.reset")}
      </Button>
      {canCancel && (
        <Button variant="destructive" onClick={handleCancel}>
          <XCircleIcon data-icon="inline-start" />
          {t("actions.cancel")}
        </Button>
      )}
      {canRetry && (
        <Button
          variant={canDownload ? "outline" : "default"}
          onClick={handleRetry}
        >
          <LightningIcon data-icon="inline-start" />
          {t("actions.retry")}
        </Button>
      )}
      {canReprocess && (
        <Button variant="outline" onClick={handleReprocess}>
          <LightningIcon data-icon="inline-start" />
          {t("actions.reprocess")}
        </Button>
      )}
      {canDownload && (
        <Button asChild>
          <a
            href={processedImageUrl!}
            download={processedFileName ?? undefined}
            onClick={handleDownload}
            aria-label={t("actions.downloadJpeg")}
          >
            <DownloadSimpleIcon data-icon="inline-start" />
            {t(mobile ? "actions.download" : "actions.downloadJpeg")}
          </a>
        </Button>
      )}
      {(!mobile || !canProcess) && metadataAction}
    </div>
  );

  return (
    <div
      className={cn(
        "workflow-action-bar bg-card text-card-foreground flex flex-col justify-between gap-4 border p-4 lg:sticky lg:z-30 @min-[52rem]/workspace:flex-row @min-[52rem]/workspace:items-center",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium sm:text-base">
        <FileImageIcon
          className="text-muted-foreground size-5 shrink-0"
          weight="bold"
        />
        <span
          ref={fileNameRef}
          tabIndex={-1}
          className="focus-visible:outline-ring truncate focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid"
        >
          {fileName}
        </span>
      </div>
      {mobile ? createPortal(actions, document.body) : actions}
      {mobile && canProcess && metadataAction}
    </div>
  );
}
