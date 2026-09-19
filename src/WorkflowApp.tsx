import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/Header";
import { WorkspaceFrame } from "@/components/WorkspaceFrame";
import { BatchQueuePanel } from "@/components/BatchQueuePanel";
import { BatchResult } from "@/components/BatchResult";
import { CrushQualityControl } from "@/components/CrushQualityControl";
import { Button } from "@/components/ui/button";
import { useBatchQueue } from "@/hooks/useBatchQueue";
import { DEFAULT_OPTIONS } from "@/lib/pipeline";
import { useWorkflowOperations } from "@/hooks/useWorkflowOperations";
import { presentBatch } from "@/lib/workflow/presentation";
import { translateMessage } from "@/i18n/messages";
import { trackAction } from "@/lib/analytics";

export default function WorkflowApp({
  initialFiles,
  onResetToShell,
}: {
  initialFiles: File[];
  onResetToShell: () => void;
}) {
  const { t } = useTranslation("workflow");
  const { queue, snapshot } = useBatchQueue(initialFiles);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quality, setQuality] = useState(DEFAULT_OPTIONS.crush!.quality);
  const { operations, snapshot: operationState } = useWorkflowOperations(queue);
  const { operation, archiveNotice } = operationState;
  const exporting = operation?.kind === "export";
  const locked = snapshot.operationLocked;
  const selected =
    snapshot.items.find((item) => item.id === selectedId) ?? snapshot.items[0];
  const options = {
    ...DEFAULT_OPTIONS,
    crush: { ...DEFAULT_OPTIONS.crush, quality },
  };
  const capabilities = presentBatch(snapshot);
  return (
    <WorkspaceFrame mode="batch">
      <div className="flex min-w-0 flex-col gap-6">
        <Header />
        <div className="min-w-0">
          <BatchQueuePanel
            queue={queue}
            snapshot={snapshot}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            onAdd={(files) => {
              if (queue.add(files, options)) {
                trackAction("upload_image", "uploader", {
                  file_count: files.length,
                });
              }
            }}
            locked={locked}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-3 border-t pt-4">
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!capabilities.canExport}
                onClick={operations.downloadArchive}
              >
                {t(exporting ? "batch.exporting" : "batch.zip", {
                  count: capabilities.ready,
                })}
              </Button>
              {operation && (
                <Button
                  variant="outline"
                  disabled={operation.cancelling}
                  onClick={operations.cancel}
                >
                  {t(exporting ? "batch.cancelExport" : "batch.cancelCleanup")}
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={!capabilities.canReset}
                onClick={() => {
                  trackAction("reset", "action_bar");
                  onResetToShell();
                }}
              >
                {t("batch.clear")}
              </Button>
            </div>
            <p className="text-muted-foreground text-sm">
              {t("batch.exportHelp")}
            </p>
            {operation?.kind === "metadata" && (
              <p
                role="status"
                className="text-primary-text text-sm wrap-anywhere"
              >
                {t("batch.cleaningMetadata", { name: operation.fileName })}
              </p>
            )}
            {archiveNotice.length > 0 && (
              <p role="status" className="text-primary-text text-sm">
                {archiveNotice
                  .map((notice) => translateMessage(t, notice))
                  .join(" ")}
              </p>
            )}
          </div>
          <div>
            <CrushQualityControl
              value={quality}
              onChange={setQuality}
              disabled={locked}
            />
            <p className="text-muted-foreground mt-2 text-sm">
              {t("batch.qualityHelp")}
            </p>
          </div>
        </div>
      </div>
      {selected && (
        <div className="min-w-0">
          <BatchResult
            key={selected.id}
            item={selected}
            queue={queue}
            options={options}
            locked={locked}
            canCleanMetadata={capabilities.canCleanMetadata}
            operations={operations}
            notice={
              operationState.itemNotice?.itemId === selected.id
                ? operationState.itemNotice.messages
                : []
            }
          />
        </div>
      )}
    </WorkspaceFrame>
  );
}
