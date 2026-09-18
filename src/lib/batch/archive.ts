import { strToU8, Zip, ZipPassThrough } from "fflate";
import type { ImageAuditResult } from "@/lib/types";
import type { BatchItem } from "./queue";

export interface ArchiveEntry {
  name: string;
  blob: Blob;
}
export interface BatchReport {
  version: 1;
  scope: string;
  images: {
    name: string;
    status: string;
    output: string | null;
    warnings: string[];
    error: string | null;
    checks?: {
      before: ReturnType<typeof auditSummary>;
      after: ReturnType<typeof auditSummary>;
    };
  }[];
}
export function createBatchReport(items: readonly BatchItem[]): BatchReport {
  return {
    version: 1,
    scope:
      "Local observations only. Hidden watermark removal and signer trust are not verified.",
    images: items.map((item) => ({
      name: item.file.name,
      status: item.status,
      output: item.result?.output ? item.outputName : null,
      warnings: item.result?.warnings.map((warning) => warning.key) ?? [],
      error: item.error?.key ?? null,
      checks: {
        before: auditSummary(item.result?.preflight ?? null),
        after: auditSummary(item.result?.postflight ?? null),
      },
    })),
  };
}

function auditSummary(audit: ImageAuditResult | null) {
  if (!audit) return null;
  return {
    originEvidence: audit.aiScore.kind,
    visibleMark: audit.visibleWatermark.status,
    hiddenMark: audit.hiddenWatermark.status,
    metadataSignals: audit.metadataScan?.signals.length ?? null,
    metadataCoverage:
      audit.metadataScan?.warnings.map((warning) => warning.code) ?? null,
    credentials: audit.metadataScan?.c2pa ?? null,
  };
}

// JPEGs are already compressed. Stream each Blob into a stored ZIP entry, with
// bounded reads; never decode pixels or buffer every input. The caller limits
// total output size and prevents processing while an archive is assembled.
export async function streamArchive(
  entries: ArchiveEntry[],
  report: BatchReport,
  onChunk: (chunk: Uint8Array, final: boolean) => void,
  signal?: AbortSignal,
) {
  const zip = new Zip((error, data, final) => {
    if (error) throw error;
    onChunk(data, final);
  });
  try {
    for (const entry of entries) {
      signal?.throwIfAborted();
      const file = new ZipPassThrough(entry.name);
      zip.add(file);
      const reader = entry.blob.stream().getReader();
      try {
        while (true) {
          signal?.throwIfAborted();
          const { value, done } = await reader.read();
          if (done) break;
          file.push(value, false);
        }
        file.push(new Uint8Array(), true);
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
    }
    const manifest = new ZipPassThrough("report.json");
    zip.add(manifest);
    manifest.push(strToU8(JSON.stringify(report, null, 2)), true);
    zip.end();
  } catch (error) {
    zip.terminate();
    throw error;
  }
}
