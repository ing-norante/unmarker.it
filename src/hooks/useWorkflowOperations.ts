import { useEffect, useState, useSyncExternalStore } from "react";
import type { BatchQueue } from "@/lib/batch/queue";
import { WorkflowOperations } from "@/lib/workflow/operations";
import { exportBatch } from "@/lib/batch/export";
import { cleanImageMetadata } from "@/lib/metadataCleaner";
import { downloadBlob } from "@/lib/downloadBlob";
import { trackAction } from "@/lib/analytics";

export function useWorkflowOperations(queue: BatchQueue) {
  const [operations] = useState(
    () =>
      new WorkflowOperations(queue, {
        cleanMetadata: cleanImageMetadata,
        exportArchive: exportBatch,
        download: downloadBlob,
        onMetadataDownload: (result) =>
          trackAction("download_metadata_clean", "workflow", {
            removed_count: result.removedCount,
            format: result.format,
          }),
      }),
  );
  const snapshot = useSyncExternalStore(
    operations.subscribe,
    operations.getSnapshot,
    operations.getSnapshot,
  );
  useEffect(() => {
    operations.start();
    return operations.stop;
  }, [operations]);
  return { operations, snapshot };
}
