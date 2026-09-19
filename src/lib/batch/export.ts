import { BATCH_LIMITS, type BatchItem } from "./queue";
import { createBatchReport } from "./archive";
import { assertNotAborted } from "../runtime/abort";
import { runJob } from "../runtime/job";

export function exportBatch(
  items: readonly BatchItem[],
  signal?: AbortSignal,
): Promise<Blob> {
  assertNotAborted(signal);
  const entries = items.flatMap((item) =>
    item.result?.output
      ? [{ name: item.outputName, blob: item.result.output }]
      : [],
  );
  if (
    !entries.length ||
    entries.reduce((sum, entry) => sum + entry.blob.size, 0) >
      BATCH_LIMITS.outputBytes
  ) {
    return Promise.reject(new Error("Invalid archive size"));
  }
  let worker: Worker | undefined;
  const parts: ArrayBuffer[] = [];
  let size = 0;
  return runJob<Blob>(
    {
      signal,
      timeoutMs: 120_000,
      timeoutMessage: "Archive timed out",
      cleanup: () => {
        worker?.terminate();
        parts.length = 0;
      },
    },
    (job) => {
      worker = new Worker(
        new URL("../../workers/batchExport.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onerror = () => job.reject(new Error("Archive worker failed"));
      worker.onmessageerror = () =>
        job.reject(new Error("Archive message failed"));
      worker.onmessage = ({ data }: MessageEvent<unknown>) => {
        if (job.settled) return;
        if (
          !data ||
          typeof data !== "object" ||
          ("error" in data && data.error === true) ||
          !("bytes" in data) ||
          !(data.bytes instanceof Uint8Array) ||
          !("final" in data) ||
          typeof data.final !== "boolean"
        ) {
          job.reject(new Error("Archive failed: invalid response"));
          return;
        }
        size += data.bytes.byteLength;
        if (size > BATCH_LIMITS.outputBytes + 2 * 1024 ** 2) {
          job.reject(new Error("Archive size limit"));
          return;
        }
        // Worker sends owned chunks; slicing a foreign view also keeps this boundary safe.
        const bytes =
          data.bytes.byteOffset === 0 &&
          data.bytes.byteLength === data.bytes.buffer.byteLength &&
          data.bytes.buffer instanceof ArrayBuffer
            ? data.bytes.buffer
            : data.bytes.slice().buffer;
        parts.push(bytes);
        if (data.final) {
          try {
            job.resolve(new Blob(parts, { type: "application/zip" }));
          } catch {
            job.reject(new Error("Archive allocation failed"));
          }
        }
      };
      try {
        worker.postMessage({ entries, report: createBatchReport(items) });
      } catch {
        job.reject(new Error("Archive dispatch failed"));
      }
    },
  );
}
