import type {
  MetadataCleanResult,
  MetadataImageFormat,
  MetadataScanResult,
  MetadataSignal,
} from "@/lib/types";
import {
  addWarning,
  asciiBytes,
  buildCleanResult,
  concatUint8Arrays,
  originalCleanResult,
  readAscii,
  toDataView,
  writeUint32Le,
} from "../binary";
import { createSignal, findAiMarkers, toScanResult } from "../markers";

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
  const warnings: string[] = [];
  const chunks = walkRiffChunks(bytes, warnings);

  for (const chunk of chunks) {
    const signal = getWebpChunkSignal(chunk);
    if (signal) {
      signals.push(signal);
    }
  }

  return toScanResult(format, signals, warnings);
}

export function cleanWebpMetadata(
  file: File,
  bytes: Uint8Array,
): MetadataCleanResult {
  const warnings: string[] = [];
  const chunks = walkRiffChunks(bytes, warnings);

  if (chunks.length === 0 || warnings.length > 0) {
    return originalCleanResult(file, "webp", warnings);
  }

  const keptChunks: Uint8Array[] = [];
  let removedCount = 0;

  for (const chunk of chunks) {
    if (getWebpChunkSignal(chunk)) {
      removedCount += 1;
      continue;
    }

    keptChunks.push(bytes.subarray(chunk.start, chunk.end));
  }

  if (removedCount === 0) {
    return buildCleanResult(file, "webp", [bytes], 0, warnings);
  }

  const body = concatUint8Arrays(keptChunks);
  const output = new Uint8Array(12 + body.length);
  output.set(asciiBytes(RIFF_SIGNATURE), 0);
  writeUint32Le(output, 4, output.length - 8);
  output.set(asciiBytes(WEBP_SIGNATURE), 8);
  output.set(body, 12);

  return buildCleanResult(file, "webp", [output], removedCount, warnings);
}

function getWebpChunkSignal(chunk: RiffChunk): MetadataSignal | null {
  if (chunk.type !== "EXIF" && chunk.type !== "XMP ") {
    return null;
  }

  const markers = findAiMarkers(chunk.data);
  if (markers.length === 0) {
    return null;
  }

  return createSignal(
    "webp-metadata",
    "WebP metadata AI marker",
    `WebP ${chunk.type.trim()}`,
    markers[0],
  );
}

function walkRiffChunks(bytes: Uint8Array, warnings: string[]): RiffChunk[] {
  if (!isWebpBytes(bytes)) {
    addWarning(warnings, "Malformed WebP RIFF header.");
    return [];
  }

  const view = toDataView(bytes);
  const riffEnd = Math.min(bytes.length, view.getUint32(4, true) + 8);
  const chunks: RiffChunk[] = [];
  let offset = 12;

  if (riffEnd > bytes.length) {
    addWarning(warnings, "WebP RIFF size exceeds file length.");
    return chunks;
  }

  while (offset < riffEnd) {
    if (offset + 8 > riffEnd) {
      addWarning(warnings, "Malformed WebP chunk table.");
      return chunks;
    }

    const type = readAscii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    const end = dataEnd + (size % 2);

    if (end > riffEnd) {
      addWarning(warnings, `Malformed WebP ${type.trim()} chunk length.`);
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
