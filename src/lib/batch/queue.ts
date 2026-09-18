import { message, type MessageDescriptor } from "@/i18n/messages";
import { validateWorkflowFile } from "@/lib/fileValidation";
import {
  ImageEngineError,
  type ImageEngineControls,
  type ImageEngineProgress,
  type ImageEngineResult,
} from "@/lib/engine/types";
import type { ProcessingOptions } from "@/lib/types";

export const BATCH_LIMITS = {
  items: 20,
  inputBytes: 200 * 1024 ** 2,
  outputBytes: 128 * 1024 ** 2,
};
export type BatchStatus =
  | "waiting"
  | "running"
  | ImageEngineResult["outcome"]
  | "failed"
  | "cancelled"
  | "rejected";
export interface BatchItem {
  id: string;
  attempt: number;
  file: File;
  options: ProcessingOptions;
  status: BatchStatus;
  progress: ImageEngineProgress | null;
  result: ImageEngineResult | null;
  error: MessageDescriptor | null;
  outputName: string;
}
export interface BatchSnapshot {
  items: readonly BatchItem[];
  paused: boolean;
  activeId: string | null;
  notice: MessageDescriptor | null;
}
export type ImageProcessor = (
  file: File,
  options: ProcessingOptions,
  controls: ImageEngineControls,
) => Promise<ImageEngineResult>;

// Names belong to entries, not attempts. Retries always start from the original File.
export function uniqueOutputName(name: string, reserved: Set<string>): string {
  // Strip control characters as well as path separators from ZIP entry names.
  const stem =
    name
      .replace(/\.[^.]*$/, "")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, "_")
      .replace(/^[. ]+|[. ]+$/g, "")
      .slice(0, 100) || "image";
  let output = `${stem}-unmarker.jpg`;
  for (let suffix = 2; reserved.has(output.toLowerCase()); suffix++)
    output = `${stem}-unmarker-${suffix}.jpg`;
  reserved.add(output.toLowerCase());
  return output;
}

export class BatchQueue {
  private snapshot: BatchSnapshot = {
    items: [],
    paused: false,
    activeId: null,
    notice: null,
  };
  private listeners = new Set<() => void>();
  private current: {
    id: string;
    attempt: number;
    controller: AbortController;
  } | null = null;
  private nextId = 0;
  private disposed = false;
  private reserved = new Set<string>(["report.json"]);
  private readonly process: ImageProcessor;
  private readonly limits: typeof BATCH_LIMITS;
  constructor(process: ImageProcessor, limits = BATCH_LIMITS) {
    this.process = process;
    this.limits = limits;
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<BatchSnapshot>) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private update(id: string, patch: Partial<BatchItem>) {
    this.publish({
      items: this.snapshot.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  }
  add(files: readonly File[], options: ProcessingOptions) {
    if (this.disposed) return;
    const items = [...this.snapshot.items];
    let inputBytes = items.reduce((sum, item) => sum + item.file.size, 0);
    let declined = 0;
    for (const file of files) {
      if (
        items.length >= this.limits.items ||
        inputBytes + file.size > this.limits.inputBytes
      ) {
        declined++;
        continue;
      }
      const validation = validateWorkflowFile(file);
      items.push({
        id: String(++this.nextId),
        attempt: 0,
        file,
        options: structuredClone(options),
        status: validation.ok ? "waiting" : "rejected",
        progress: null,
        result: null,
        error: validation.ok ? null : validation.statusMessage.description,
        outputName: uniqueOutputName(file.name, this.reserved),
      });
      inputBytes += file.size;
    }
    this.publish({
      items,
      notice: declined
        ? message("workflow:batch.admissionLimit", {
            count: declined,
            max: this.limits.items,
            mb: this.limits.inputBytes / 1024 ** 2,
          })
        : null,
    });
    this.pump();
  }
  pause = () => this.publish({ paused: true });
  resume = () => {
    this.publish({ paused: false, notice: null });
    this.pump();
  };
  cancel(id: string) {
    const item = this.snapshot.items.find((item) => item.id === id);
    if (!item || !["waiting", "running"].includes(item.status)) return;
    this.update(id, { status: "cancelled" });
    if (this.current?.id === id) this.current.controller.abort();
  }
  cancelAll = () => {
    this.publish({
      paused: true,
      items: this.snapshot.items.map((item) =>
        ["waiting", "running"].includes(item.status)
          ? { ...item, status: "cancelled" }
          : item,
      ),
    });
    this.current?.controller.abort();
  };
  retry(id: string, options?: ProcessingOptions) {
    const item = this.snapshot.items.find((item) => item.id === id);
    if (
      !item ||
      item.status === "running" ||
      item.status === "waiting" ||
      item.status === "rejected"
    )
      return;
    this.update(id, {
      status: "waiting",
      result: null,
      progress: null,
      error: null,
      attempt: item.attempt + 1,
      options: structuredClone(options ?? item.options),
    });
    this.pump();
  }
  remove(id: string) {
    if (this.current?.id === id) this.current.controller.abort();
    this.publish({
      items: this.snapshot.items.filter((item) => item.id !== id),
    });
  }
  dispose = () => {
    this.disposed = true;
    this.current?.controller.abort();
    this.listeners.clear();
    this.snapshot = { items: [], paused: true, activeId: null, notice: null };
  };
  private pump() {
    if (this.disposed || this.current || this.snapshot.paused) return;
    const item = this.snapshot.items.find((item) => item.status === "waiting");
    if (!item) return;
    const run = {
      id: item.id,
      attempt: item.attempt,
      controller: new AbortController(),
    };
    this.current = run;
    this.publish({ activeId: item.id });
    this.update(item.id, { status: "running" });
    const isCurrent = () =>
      !this.disposed &&
      !run.controller.signal.aborted &&
      this.snapshot.items.some(
        (entry) =>
          entry.id === run.id &&
          entry.attempt === run.attempt &&
          entry.status === "running",
      );
    void Promise.resolve()
      .then(() => {
        if (!isCurrent()) throw new DOMException("Aborted", "AbortError");
        return this.process(item.file, item.options, {
          signal: run.controller.signal,
          onProgress: (progress) => {
            if (isCurrent()) this.update(item.id, { progress });
          },
        });
      })
      .then((result) => {
        if (!isCurrent()) return;
        const retained = this.snapshot.items.reduce(
          (sum, entry) => sum + (entry.result?.output?.size ?? 0),
          0,
        );
        if (retained + (result.output?.size ?? 0) > this.limits.outputBytes) {
          const error = message("workflow:batch.outputLimit", {
            mb: this.limits.outputBytes / 1024 ** 2,
          });
          this.update(item.id, { status: "failed", error });
          this.publish({ paused: true, notice: error });
        } else {
          this.update(item.id, { result, status: result.outcome });
        }
      })
      .catch((error) => {
        if (!isCurrent()) return;
        this.update(item.id, {
          status: "failed",
          error:
            error instanceof ImageEngineError
              ? error.descriptor
              : message("workflow:batch.failed"),
        });
      })
      .finally(() => {
        if (this.current === run) {
          this.current = null;
          this.publish({ activeId: null });
          this.pump();
        }
      });
  }
}
