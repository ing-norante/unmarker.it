import { useTranslation } from "react-i18next";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
import type { BatchItem, BatchQueue } from "@/lib/batch/queue";
import type { ProcessingOptions } from "@/lib/types";
import { ImageComparison } from "./ImageComparison";
import { PipelineSteps } from "./PipelineSteps";
import { WorkflowSummary } from "./WorkflowStatus";
import { Button } from "./ui/button";
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
        </div>
        {item.result?.canCleanMetadata && (
          <p className="text-muted-foreground text-sm">
            {t("batch.metadataHelp")}
          </p>
        )}
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
