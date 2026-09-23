import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DownloadSimpleIcon, InfoIcon } from "@phosphor-icons/react";
import type { BatchItem, BatchQueue } from "@/lib/batch/queue";
import type { ProcessingOptions } from "@/lib/types";
import { ImageComparison } from "./ImageComparison";
import { PipelineSteps } from "./PipelineSteps";
import { WorkflowSummary } from "./WorkflowStatus";
import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { useBlobUrl } from "@/hooks/useBlobUrl";
import { trackAction } from "@/lib/analytics";
import { downloadBlob } from "@/lib/downloadBlob";
import type { WorkflowOperations } from "@/lib/workflow/operations";
import { presentBatchItem } from "@/lib/workflow/presentation";
import type { MessageDescriptor } from "@/i18n/messages";
import { translateMessage } from "@/i18n/messages";

export function BatchResult({
  item,
  queue,
  options,
  locked,
  canCleanMetadata,
  operations,
  notice,
}: {
  item: BatchItem;
  queue: BatchQueue;
  options: ProcessingOptions;
  locked: boolean;
  canCleanMetadata: boolean;
  operations: WorkflowOperations;
  notice: readonly MessageDescriptor[];
}) {
  const { t } = useTranslation("workflow");
  const [downloadHelpOpen, setDownloadHelpOpen] = useState(false);
  const originalUrl = useBlobUrl(item.file);
  const outputUrl = useBlobUrl(item.result?.output ?? null);
  const presentation = presentBatchItem(item);
  const { phase, preflight, output } = presentation;
  return (
    <section
      className="@container/workspace flex min-w-0 flex-col gap-4"
      aria-label={t("batch.select", { name: item.file.name })}
    >
      <div className="bg-background flex flex-col gap-3 border-b pb-4">
        <h2 className="text-xl font-black wrap-anywhere">{item.file.name}</h2>
        <div className="flex flex-wrap gap-2">
          {output && (
            <Button
              onClick={() => {
                downloadBlob(output, item.outputName);
                trackAction("download_processed", "action_bar");
                operations.notifyDownload(item.id);
              }}
            >
              <DownloadSimpleIcon />
              {t("batch.download")}
            </Button>
          )}
          {presentation.pending ? (
            <Button
              variant="outline"
              onClick={() => {
                trackAction("cancel_processing", "action_bar");
                queue.cancel(item.id);
              }}
              disabled={locked}
            >
              {t("batch.cancel")}
            </Button>
          ) : (
            presentation.retryable && (
              <Button
                variant="outline"
                disabled={locked}
                onClick={() => {
                  operations.clearItemNotice();
                  queue.retry(item.id, options);
                }}
              >
                {t(item.result?.output ? "batch.reprocess" : "batch.retry")}
              </Button>
            )
          )}
          {item.result?.canCleanMetadata && (
            <Button
              variant="ghost"
              disabled={!canCleanMetadata}
              onClick={() => operations.cleanMetadata(item.id)}
            >
              {t("batch.metadata")}
            </Button>
          )}
          {(output || item.result?.canCleanMetadata) && (
            <TooltipProvider>
              <Tooltip
                open={downloadHelpOpen}
                onOpenChange={setDownloadHelpOpen}
              >
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("batch.downloadHelpLabel")}
                    onClick={() => setDownloadHelpOpen((open) => !open)}
                  >
                    <InfoIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="max-w-[calc(100vw-2rem)] flex-col items-start gap-2 text-left leading-relaxed sm:max-w-80"
                >
                  {output && <p>{t("batch.downloadHelp")}</p>}
                  {item.result?.canCleanMetadata && (
                    <p>{t("batch.metadataHelp")}</p>
                  )}
                  {output && item.result?.canCleanMetadata && (
                    <p>{t("batch.downloadSizeHelp")}</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {notice.length > 0 && (
          <p role="status" className="text-primary-text text-sm">
            {notice.map((entry) => translateMessage(t, entry)).join(" ")}
          </p>
        )}
      </div>
      {item.error && (
        <p role="alert" className="text-destructive-text border p-4">
          {translateMessage(t, item.error)}
        </p>
      )}
      {item.status === "waiting" ? (
        <p className="text-muted-foreground border p-4">{t("batch.waiting")}</p>
      ) : (
        <WorkflowSummary
          phase={phase}
          hasWarnings={presentation.hasWarnings}
          verificationFailed={presentation.verificationFailed}
        />
      )}
      {item.status === "running" && item.progress && (
        <PipelineSteps steps={item.progress.steps} />
      )}
      {originalUrl && (preflight || item.status === "running") && (
        <ImageComparison
          originalImageUrl={originalUrl}
          processedImageUrl={outputUrl}
          phase={phase}
          preflightAudit={preflight}
          postflightAudit={item.result?.postflight ?? null}
          workflowWarnings={item.result?.warnings ?? []}
        />
      )}
    </section>
  );
}
