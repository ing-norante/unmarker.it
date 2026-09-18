import type {
  MetadataCleanResult,
  MetadataImageFormat,
  MetadataScanResult,
  MetadataSignal,
  MetadataWarning,
} from "@/lib/types";
import {
  addWarning,
  asciiBytes,
  buildCleanResult,
  originalCleanResult,
  readAscii,
  toDataView,
  writeUint32Le,
} from "../binary";
import { createSignal, findAiMarkers, hasBlockingCleanWarning, toScanResult } from "../markers";

export const RIFF_SIGNATURE = "RIFF";
export const WEBP_SIGNATURE = "WEBP";

interface RiffChunk {
  type: string;
  start: number;
  dataStart: number;
  dataEnd: number;
  end: number;
  data: Uint8Array;
}

export function isWebpBytes(bytes: Uint8Array) {
  return (
    readAscii(bytes, 0, 4) === RIFF_SIGNATURE &&
    readAscii(bytes, 8, 4) === WEBP_SIGNATURE
  );
}

export function scanWebpMetadata(
  bytes: Uint8Array,
  format: MetadataImageFormat,
): MetadataScanResult {
  const signals: MetadataSignal[] = [];
  const warnings: MetadataWarning[] = [];
  const chunks = walkRiffChunks(bytes, warnings);

  for (const chunk of chunks) {
    const signal = getWebpChunkSignal(chunk);
    if (signal) {
      signals.push(signal);
      if (!signal.removable) addWarning(warnings, "display-metadata-preserved");
    }
  }

  return toScanResult(format, signals, warnings);
}

export function cleanWebpMetadata(
  file: File,
  bytes: Uint8Array,
): MetadataCleanResult {
  const warnings: MetadataWarning[] = [];
  const chunks = walkRiffChunks(bytes, warnings);

  if (chunks.length === 0 || hasBlockingCleanWarning(warnings)) {
    return originalCleanResult(file, "webp", warnings);
  }

  const keptChunks: Uint8Array[] = [];
  let removedCount = 0;
  const retainedTypes = new Set<string>();

  for (const chunk of chunks) {
    const signal = getWebpChunkSignal(chunk);
    if (signal?.removable) {
      removedCount += 1;
      continue;
    }
    if (signal) addWarning(warnings, "display-metadata-preserved");
    retainedTypes.add(chunk.type);
    keptChunks.push(chunk.type === "VP8X"
      ? bytes.slice(chunk.start, chunk.end)
      : bytes.subarray(chunk.start, chunk.end));
  }

  if (removedCount === 0) {
    return buildCleanResult(file, "webp", [bytes], 0, warnings);
  }

  for (const chunk of keptChunks) {
    // Recompute metadata bits only; retain alpha, animation and ICC features.
    if (readAscii(chunk, 0, 4) === "VP8X" && chunk.length >= 18) {
      chunk[8] = (chunk[8] & ~0x0c) |
        (retainedTypes.has("EXIF") ? 0x08 : 0) |
        (retainedTypes.has("XMP ") ? 0x04 : 0);
    }
  }

  const header = new Uint8Array(12);
  header.set(asciiBytes(RIFF_SIGNATURE), 0);
  writeUint32Le(header, 4, 4 + keptChunks.reduce((total, chunk) => total + chunk.length, 0));
  header.set(asciiBytes(WEBP_SIGNATURE), 8);

  return buildCleanResult(file, "webp", [header, ...keptChunks], removedCount, warnings);
}

function getWebpChunkSignal(chunk: RiffChunk): MetadataSignal | null {
  if (chunk.type === "C2PA") {
    return createSignal("c2pa", "metadata:signals.webp", "WebP C2PA", "c2pa");
  }
  if (chunk.type !== "EXIF" && chunk.type !== "XMP ") {
    return null;
  }

  const markers = findAiMarkers(chunk.data);
  if (markers.length === 0) {
    return null;
  }

  return createSignal(
    "webp-metadata",
    "metadata:signals.webp",
    `WebP ${chunk.type.trim()}`,
    markers[0],
    chunk.type !== "EXIF",
  );
}

function walkRiffChunks(
  bytes: Uint8Array,
  warnings: MetadataWarning[],
): RiffChunk[] {
  if (!isWebpBytes(bytes)) {
    addWarning(warnings, "malformed-webp-header");
    return [];
  }

  const view = toDataView(bytes);
  const riffEnd = view.getUint32(4, true) + 8;
  const chunks: RiffChunk[] = [];
  let offset = 12;

  if (riffEnd > bytes.length) {
    addWarning(warnings, "webp-size-exceeds-file");
    return chunks;
  }
  if (riffEnd < 12 || riffEnd !== bytes.length) {
    addWarning(warnings, "malformed-webp-table");
    return chunks;
  }

  while (offset < riffEnd) {
    if (offset + 8 > riffEnd) {
      addWarning(warnings, "malformed-webp-table");
      return chunks;
    }

    const type = readAscii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    const end = dataEnd + (size % 2);

    if (end > riffEnd) {
      addWarning(warnings, "malformed-webp-chunk", { type: type.trim() });
      return chunks;
    }
    if (type === "VP8X" && size !== 10) {
      addWarning(warnings, "malformed-webp-chunk", { type });
      return chunks;
    }

    chunks.push({
      type,
      start: offset,
      dataStart,
      dataEnd,
      end,
      data: bytes.subarray(dataStart, dataEnd),
    });

    offset = end;
  }

  return chunks;
}
