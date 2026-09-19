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
interface BatchItemIdentity {
  id: string;
  attempt: number;
  file: File;
  options: ProcessingOptions;
  outputName: string;
}
type BatchSuccess = {
  [Status in ImageEngineResult["outcome"]]: BatchItemIdentity & {
    status: Status;
    result: Extract<ImageEngineResult, { outcome: Status }>;
    error: null;
    progress: ImageEngineProgress | null;
  };
}[ImageEngineResult["outcome"]];
export type BatchItem =
  | BatchSuccess
  | (BatchItemIdentity &
      (
        | { status: "waiting"; result: null; error: null; progress: null }
        | {
            status: "running" | "cancelled";
            result: null;
            error: null;
            progress: ImageEngineProgress | null;
          }
        | {
            status: "failed" | "rejected";
            result: null;
            error: MessageDescriptor;
            progress: ImageEngineProgress | null;
          }
      ));
export type BatchStatus = BatchItem["status"];
export interface BatchSnapshot {
  items: readonly BatchItem[];
  paused: boolean;
  activeId: string | null;
  notice: MessageDescriptor | null;
  operationLocked: boolean;
}
export type ImageProcessor = (
  file: File,
  options: ProcessingOptions,
  controls: ImageEngineControls,
) => Promise<ImageEngineResult>;

export function uniqueOutputName(name: string, reserved: Set<string>): string {
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

function waiting(item: BatchItemIdentity): BatchItem {
  return {
    ...item,
    status: "waiting",
    result: null,
    error: null,
    progress: null,
  };
}
function completed(
  item: BatchItemIdentity,
  progress: ImageEngineProgress | null,
  result: ImageEngineResult,
): BatchItem {
  // Preserve the correlation between the queue status and the result discriminant.
  switch (result.outcome) {
    case "completed":
      return { ...item, progress, status: "completed", error: null, result };
    case "completed-with-warnings":
      return {
        ...item,
        progress,
        status: "completed-with-warnings",
        error: null,
        result,
      };
    case "analysis-only":
      return {
        ...item,
        progress,
        status: "analysis-only",
        error: null,
        result,
      };
  }
}

export class BatchQueue {
  private snapshot: BatchSnapshot = {
    items: [],
    paused: false,
    activeId: null,
    notice: null,
    operationLocked: false,
  };
  private listeners = new Set<() => void>();
  private current: {
    id: string;
    attempt: number;
    controller: AbortController;
  } | null = null;
  private nextId = 0;
  private disposed = false;
  private operation: symbol | null = null;
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
  private transition(id: string, change: (item: BatchItem) => BatchItem) {
    this.publish({
      items: this.snapshot.items.map((item) =>
        item.id === id ? change(item) : item,
      ),
    });
  }
  /** Exclusive metadata/export work while no image is active. User pause state is untouched. */
  acquireOperation = (): (() => void) | null => {
    if (this.disposed || this.current || this.operation) return null;
    const token = Symbol("workspace-operation");
    this.operation = token;
    this.publish({ operationLocked: true });
    return () => {
      if (this.disposed || this.operation !== token) return;
      this.operation = null;
      this.publish({ operationLocked: false });
      this.pump();
    };
  };
  add(files: readonly File[], options: ProcessingOptions): boolean {
    if (this.disposed || this.operation) return false;
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
      const identity: BatchItemIdentity = {
        id: String(++this.nextId),
        attempt: 0,
        file,
        options: structuredClone(options),
        outputName: uniqueOutputName(file.name, this.reserved),
      };
      items.push(
        validation.ok
          ? waiting(identity)
          : {
              ...identity,
              status: "rejected",
              result: null,
              progress: null,
              error: validation.statusMessage.description,
            },
      );
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
    return true;
  }
  pause = () => this.publish({ paused: true });
  resume = () => {
    if (this.disposed || this.operation) return false;
    this.publish({ paused: false, notice: null });
    this.pump();
    return true;
  };
  cancel(id: string) {
    if (this.disposed || this.operation) return;
    this.transition(id, (item) =>
      item.status === "waiting" || item.status === "running"
        ? { ...item, status: "cancelled" }
        : item,
    );
    if (this.current?.id === id) this.current.controller.abort();
  }
  cancelAll = () => {
    if (this.disposed || this.operation) return;
    this.publish({
      paused: true,
      items: this.snapshot.items.map((item) =>
        item.status === "waiting" || item.status === "running"
          ? { ...item, status: "cancelled" }
          : item,
      ),
    });
    this.current?.controller.abort();
  };
  retry(id: string, options?: ProcessingOptions) {
    if (this.disposed || this.operation) return;
    this.transition(id, (item) =>
      item.status === "running" ||
      item.status === "waiting" ||
      item.status === "rejected"
        ? item
        : waiting({
            ...item,
            attempt: item.attempt + 1,
            options: structuredClone(options ?? item.options),
          }),
    );
    this.pump();
  }
  remove(id: string) {
    if (this.disposed || this.operation) return;
    if (this.current?.id === id) this.current.controller.abort();
    this.publish({
      items: this.snapshot.items.filter((item) => item.id !== id),
    });
  }
  dispose = () => {
    this.disposed = true;
    this.operation = null;
    this.current?.controller.abort();
    this.listeners.clear();
    this.snapshot = {
      items: [],
      paused: true,
      activeId: null,
      notice: null,
      operationLocked: false,
    };
  };
  private pump() {
    if (this.disposed || this.current || this.snapshot.paused || this.operation)
      return;
    const item = this.snapshot.items.find((item) => item.status === "waiting");
    if (!item) return;
    const run = {
      id: item.id,
      attempt: item.attempt,
      controller: new AbortController(),
    };
    this.current = run;
    this.publish({ activeId: item.id });
    this.transition(item.id, (current) =>
      current.status === "waiting"
        ? { ...current, status: "running" }
        : current,
    );
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
            if (isCurrent())
              this.transition(item.id, (current) =>
                current.status === "running"
                  ? { ...current, progress }
                  : current,
              );
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
          this.transition(item.id, (current) => ({
            ...current,
            status: "failed",
            error,
            result: null,
          }));
          this.publish({ paused: true, notice: error });
        } else {
          this.transition(item.id, (current) =>
            completed(current, current.progress, result),
          );
        }
      })
      .catch((error) => {
        if (!isCurrent()) return;
        this.transition(item.id, (current) => ({
          ...current,
          status: "failed",
          result: null,
          error:
            error instanceof ImageEngineError
              ? error.descriptor
              : message("workflow:batch.failed"),
        }));
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
