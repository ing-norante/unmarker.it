import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
import type { BatchItem, BatchQueue } from "@/lib/batch/queue";
import type { ProcessingOptions, WorkflowPhase } from "@/lib/types";
import { ImageComparison } from "./ImageComparison";
import { PipelineSteps } from "./PipelineSteps";
import { WorkflowSummary } from "./WorkflowStatus";
import { Button } from "./ui/button";
import { cleanImageMetadata } from "@/lib/metadataCleaner";
import { useBlobUrl } from "@/hooks/useBlobUrl";
import { downloadBlob } from "@/lib/downloadBlob";
import { translateMetadataWarning } from "@/i18n/metadata";
import { translateMessage } from "@/i18n/messages";

export function BatchResult({
  item,
  queue,
  options,
  locked,
}: {
  item: BatchItem;
  queue: BatchQueue;
  options: ProcessingOptions;
  locked: boolean;
}) {
  const { t } = useTranslation("workflow");
  const originalUrl = useBlobUrl(item.file);
  const outputUrl = useBlobUrl(item.result?.output ?? null);
  const [cleaning, setCleaning] = useState(false);
  const [notice, setNotice] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const phase: WorkflowPhase =
    item.status === "running"
      ? (item.progress?.phase ?? "preflight-scanning")
      : item.status === "completed" || item.status === "completed-with-warnings"
        ? "complete"
        : item.status === "analysis-only"
          ? "analysis-only"
          : item.status === "cancelled"
            ? "cancelled"
            : item.status === "waiting"
              ? "idle"
              : "error";
  const preflight = item.result?.preflight ?? item.progress?.preflight ?? null;
  const cleanMetadata = async () => {
    setCleaning(true);
    setNotice("");
    try {
      const result = await cleanImageMetadata(item.file);
      if (!alive.current) return;
      if (result.removedCount > 0) {
        downloadBlob(result.blob, result.fileName);
        setNotice(
          [
            t("batch.downloadStarted"),
            ...result.warnings.map((warning) =>
              translateMetadataWarning(t, warning),
            ),
          ].join(" "),
        );
      } else setNotice(t("messages.cleanupNone.description"));
    } catch {
      if (alive.current) setNotice(t("messages.cleanupFailed.description"));
    } finally {
      if (alive.current) setCleaning(false);
    }
  };
  return (
    <section
      className="@container/workspace flex min-w-0 flex-col gap-4"
      aria-label={t("batch.select", { name: item.file.name })}
    >
      <div className="bg-background flex flex-col gap-3 border-b pb-4">
        <h2 className="text-xl font-black wrap-anywhere">{item.file.name}</h2>
        <div className="flex flex-wrap gap-2">
          {item.result?.output && (
            <Button
              onClick={() => {
                downloadBlob(item.result!.output!, item.outputName);
                setNotice(t("batch.downloadStarted"));
              }}
            >
              <DownloadSimpleIcon />
              {t("batch.download")}
            </Button>
          )}
          {["waiting", "running"].includes(item.status) ? (
            <Button
              variant="outline"
              onClick={() => queue.cancel(item.id)}
              disabled={locked}
            >
              {t("batch.cancel")}
            </Button>
          ) : (
            item.status !== "rejected" && (
              <Button
                variant="outline"
                disabled={locked || cleaning}
                onClick={() => {
                  setNotice("");
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
              disabled={locked || cleaning || !!queue.getSnapshot().activeId}
              onClick={cleanMetadata}
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
        {notice && (
          <p role="status" className="text-primary-text text-sm">
            {notice}
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
          hasWarnings={Boolean(item.result?.warnings.length)}
          verificationFailed={!!item.result?.output && !item.result.postflight}
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
