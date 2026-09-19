/// <reference lib="webworker" />
import {
  streamArchive,
  type ArchiveEntry,
  type BatchReport,
} from "@/lib/batch/archive";
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async ({
  data,
}: MessageEvent<{ entries: ArchiveEntry[]; report: BatchReport }>) => {
  try {
    await streamArchive(data.entries, data.report, (chunk, final) => {
      // fflate may return a view into an input chunk. Transfer only owned bytes.
      const bytes = chunk.slice();
      scope.postMessage({ bytes, final }, [bytes.buffer]);
    });
  } catch {
    scope.postMessage({ error: true });
  }
};
