import { BATCH_LIMITS, type BatchItem } from "./queue";
import { createBatchReport } from "./archive";

export function exportBatch(
  items: readonly BatchItem[],
  signal?: AbortSignal,
): Promise<Blob> {
  signal?.throwIfAborted();
  const entries = items.flatMap((item) =>
    item.result?.output
      ? [{ name: item.outputName, blob: item.result.output }]
      : [],
  );
  if (
    !entries.length ||
    entries.reduce((sum, entry) => sum + entry.blob.size, 0) >
      BATCH_LIMITS.outputBytes
  )
    return Promise.reject(new Error("Invalid archive size"));
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../../workers/batchExport.worker.ts", import.meta.url),
      { type: "module" },
    );
    const parts: ArrayBuffer[] = [];
    let size = 0;
    let settled = false;
    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener("abort", abort);
      clearTimeout(timeout);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      parts.length = 0;
      reject(error);
    };
    const abort = () => fail(new DOMException("Aborted", "AbortError"));
    const timeout = setTimeout(
      () => fail(new Error("Archive timed out")),
      120_000,
    );
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = () => fail(new Error("Archive worker failed"));
    worker.onmessageerror = () => fail(new Error("Archive message failed"));
    worker.onmessage = ({
      data,
    }: MessageEvent<{
      bytes?: Uint8Array<ArrayBuffer>;
      final?: boolean;
      error?: boolean;
    }>) => {
      if (settled) return;
      if (data.error || !data.bytes) {
        fail(new Error("Archive failed"));
        return;
      }
      size += data.bytes.byteLength;
      if (size > BATCH_LIMITS.outputBytes + 2 * 1024 ** 2) {
        fail(new Error("Archive size limit"));
        return;
      }
      parts.push(data.bytes.buffer);
      if (data.final) {
        try {
          const blob = new Blob(parts, { type: "application/zip" });
          settled = true;
          cleanup();
          parts.length = 0;
          resolve(blob);
        } catch {
          fail(new Error("Archive allocation failed"));
        }
      }
    };
    try {
      worker.postMessage({ entries, report: createBatchReport(items) });
    } catch {
      fail(new Error("Archive dispatch failed"));
    }
  });
}
