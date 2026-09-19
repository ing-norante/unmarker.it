import { message, type MessageDescriptor } from "@/i18n/messages";
import { metadataWarningMessage } from "@/i18n/metadata";
import type { BatchItem, BatchQueue } from "@/lib/batch/queue";
import type { MetadataCleanResult } from "@/lib/types";

export type WorkflowOperation =
  | { kind: "export"; cancelling: boolean }
  | { kind: "metadata"; itemId: string; fileName: string; cancelling: boolean };

export interface WorkflowOperationsSnapshot {
  operation: WorkflowOperation | null;
  archiveNotice: readonly MessageDescriptor[];
  itemNotice: { itemId: string; messages: readonly MessageDescriptor[] } | null;
}

export interface WorkflowOperationServices {
  cleanMetadata: (
    file: File,
    options: { signal: AbortSignal },
  ) => Promise<MetadataCleanResult>;
  exportArchive: (
    items: readonly BatchItem[],
    signal: AbortSignal,
  ) => Promise<Blob>;
  download: (blob: Blob, name: string) => void;
  onMetadataDownload: (result: MetadataCleanResult) => void | Promise<void>;
}

/** The queue owns exclusion; this controller owns async actions and their messages. */
export class WorkflowOperations {
  private snapshot: WorkflowOperationsSnapshot = {
    operation: null,
    archiveNotice: [],
    itemNotice: null,
  };
  private listeners = new Set<() => void>();
  private current: AbortController | null = null;
  private active = true;

  private readonly queue: BatchQueue;
  private readonly services: WorkflowOperationServices;
  constructor(queue: BatchQueue, services: WorkflowOperationServices) {
    this.queue = queue;
    this.services = services;
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<WorkflowOperationsSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  // React StrictMode can stop and restart the same controller. An old run remains
  // aborted, and retains its lease until the underlying work has actually settled.
  start = () => {
    this.active = true;
  };
  stop = () => {
    this.active = false;
    this.cancel();
  };
  cancel = () => {
    this.current?.abort();
    if (this.snapshot.operation) {
      this.publish({
        operation: { ...this.snapshot.operation, cancelling: true },
      });
    }
  };
  clearItemNotice = () => this.publish({ itemNotice: null });
  notifyDownload = (itemId: string) =>
    this.publish({
      itemNotice: {
        itemId,
        messages: [message("workflow:batch.downloadStarted")],
      },
    });

  private async run(
    operation: WorkflowOperation,
    perform: (signal: AbortSignal, isCurrent: () => boolean) => Promise<void>,
    failure: MessageDescriptor,
  ) {
    if (!this.active || this.current) return;
    const release = this.queue.acquireOperation();
    if (!release) return;
    const controller = new AbortController();
    this.current = controller;
    const isCurrent = () =>
      this.active && this.current === controller && !controller.signal.aborted;
    this.publish({
      operation,
      ...(operation.kind === "export"
        ? { archiveNotice: [] }
        : { itemNotice: null }),
    });
    try {
      await perform(controller.signal, isCurrent);
    } catch {
      if (isCurrent()) {
        this.publish(
          operation.kind === "export"
            ? { archiveNotice: [failure] }
            : { itemNotice: { itemId: operation.itemId, messages: [failure] } },
        );
      }
    } finally {
      if (this.current === controller) {
        this.current = null;
        this.publish({ operation: null });
      }
      release();
    }
  }

  downloadArchive = () =>
    this.run(
      { kind: "export", cancelling: false },
      async (signal, isCurrent) => {
        const items = this.queue.getSnapshot().items;
        if (!items.some((item) => item.result?.output)) return;
        const blob = await this.services.exportArchive(items, signal);
        if (!isCurrent()) return;
        this.services.download(blob, "unmarker-images.zip");
        this.publish({
          archiveNotice: [message("workflow:batch.downloadStarted")],
        });
      },
      message("workflow:batch.exportFailed"),
    );

  cleanMetadata = (itemId: string) => {
    const item = this.queue
      .getSnapshot()
      .items.find((entry) => entry.id === itemId);
    if (!item?.result?.canCleanMetadata) return Promise.resolve();
    return this.run(
      { kind: "metadata", itemId, fileName: item.file.name, cancelling: false },
      async (signal, isCurrent) => {
        const result = await this.services.cleanMetadata(item.file, { signal });
        if (!isCurrent()) return;
        const messages = [
          message(
            result.removedCount > 0
              ? "workflow:batch.downloadStarted"
              : "workflow:messages.cleanupNone.description",
          ),
          ...result.warnings.map(metadataWarningMessage),
        ];
        if (result.removedCount > 0) {
          this.services.download(result.blob, result.fileName);
          // Optional telemetry must never turn a successful download into failure.
          void Promise.resolve()
            .then(() => this.services.onMetadataDownload(result))
            .catch(() => {});
        }
        this.publish({ itemNotice: { itemId, messages } });
      },
      message("workflow:messages.cleanupFailed.description"),
    );
  };
}
