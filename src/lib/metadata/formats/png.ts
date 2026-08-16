import type {
  MetadataCleanResult,
  MetadataImageFormat,
  MetadataScanResult,
  MetadataSignal,
  MetadataWarning,
} from "@/lib/types";
import {
  addWarning,
  buildCleanResult,
  bytesEqual,
  originalCleanResult,
  readAscii,
  toArrayBuffer,
  toDataView,
  unique,
} from "../binary";
import { createSignal, findAiMarkers, toScanResult } from "../markers";

export const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const PNG_TEXT_CHUNKS = new Set(["tEXt", "iTXt", "zTXt"]);
const C2PA_PNG_CHUNKS = new Set(["caBX"]);

interface PngChunk {
  type: string;
  start: number;
  dataStart: number;
  dataEnd: number;
  end: number;
  data: Uint8Array;
}

export function isPngBytes(bytes: Uint8Array) {
  return bytesEqual(bytes.subarray(0, PNG_SIGNATURE.length), PNG_SIGNATURE);
}

export async function scanPngMetadata(
  bytes: Uint8Array,
  format: MetadataImageFormat,
): Promise<MetadataScanResult> {
  const signals: MetadataSignal[] = [];
  const warnings: MetadataWarning[] = [];
  const chunks = walkPngChunks(bytes, warnings);

  for (const chunk of chunks) {
    if (C2PA_PNG_CHUNKS.has(chunk.type)) {
      signals.push(
        createSignal(
          "c2pa",
          "metadata:signals.pngC2pa",
          `PNG ${chunk.type}`,
          "c2pa",
        ),
      );
      continue;
    }

    if (!PNG_TEXT_CHUNKS.has(chunk.type)) {
      continue;
    }

    const markers = await findPngTextMarkers(chunk, warnings);
    if (markers.length > 0) {
      signals.push(
        createSignal(
          "png-text",
          "metadata:signals.pngText",
          `PNG ${chunk.type}`,
          markers[0],
        ),
      );
    }
  }

  return toScanResult(format, signals, warnings);
}

export async function cleanPngMetadata(
  file: File,
  bytes: Uint8Array,
): Promise<MetadataCleanResult> {
  const warnings: MetadataWarning[] = [];
  const chunks = walkPngChunks(bytes, warnings);

  if (chunks.length === 0 || warnings.length > 0) {
    return originalCleanResult(file, "png", warnings);
  }

  const parts: Uint8Array[] = [bytes.subarray(0, PNG_SIGNATURE.length)];
  let removedCount = 0;

  for (const chunk of chunks) {
    const removeC2pa = C2PA_PNG_CHUNKS.has(chunk.type);
    const removeText =
      PNG_TEXT_CHUNKS.has(chunk.type) &&
      (await findPngTextMarkers(chunk, warnings)).length > 0;

    if (removeC2pa || removeText) {
      removedCount += 1;
      continue;
    }

    parts.push(bytes.subarray(chunk.start, chunk.end));
  }

  return buildCleanResult(file, "png", parts, removedCount, warnings);
}

async function findPngTextMarkers(
  chunk: PngChunk,
  warnings: MetadataWarning[],
): Promise<string[]> {
  const candidates = [chunk.data];
  const keyEnd = chunk.data.indexOf(0);

  if (keyEnd > 0) {
    candidates.push(chunk.data.subarray(0, keyEnd));
  }

  if (chunk.type === "zTXt" && keyEnd >= 0 && keyEnd + 2 < chunk.data.length) {
    const inflated = await inflatePngText(
      chunk.data.subarray(keyEnd + 2),
      warnings,
      "PNG zTXt",
    );
    if (inflated) {
      candidates.push(inflated);
    }
  }

  if (chunk.type === "iTXt") {
    const textBytes = getItxtTextBytes(chunk.data);
    if (textBytes) {
      if (textBytes.compressed) {
        const inflated = await inflatePngText(
          textBytes.bytes,
          warnings,
          "PNG iTXt",
        );
        if (inflated) {
          candidates.push(inflated);
        }
      } else {
        candidates.push(textBytes.bytes);
      }
    }
  }

  return unique(candidates.flatMap(findAiMarkers));
}

function getItxtTextBytes(data: Uint8Array) {
  const keyEnd = data.indexOf(0);
  if (keyEnd < 0 || keyEnd + 2 >= data.length) {
    return null;
  }

  const compressed = data[keyEnd + 1] === 1;
  let cursor = keyEnd + 3;

  for (let field = 0; field < 2; field += 1) {
    const end = data.indexOf(0, cursor);
    if (end < 0) {
      return null;
    }
    cursor = end + 1;
  }

  return { bytes: data.subarray(cursor), compressed };
}

async function inflatePngText(
  data: Uint8Array,
  warnings: MetadataWarning[],
  label: string,
): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") {
    addWarning(
      warnings,
      "png-compressed-scan-only",
      { type: label },
    );
    return null;
  }

  try {
    const stream = new Blob([toArrayBuffer(data)])
      .stream()
      .pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    addWarning(
      warnings,
      "png-decode-partial",
      { type: label },
    );
    return null;
  }
}

function walkPngChunks(bytes: Uint8Array, warnings: MetadataWarning[]): PngChunk[] {
  if (!isPngBytes(bytes)) {
    addWarning(warnings, "malformed-png-signature");
    return [];
  }

  const view = toDataView(bytes);
  const chunks: PngChunk[] = [];
  let offset = PNG_SIGNATURE.length;
  let sawIend = false;

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) {
      addWarning(warnings, "malformed-png-table");
      return chunks;
    }

    const length = view.getUint32(offset);
    const type = readAscii(bytes, offset + 4, 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const end = dataEnd + 4;

    if (end > bytes.length) {
      addWarning(warnings, "malformed-png-length", { type: type || "chunk" });
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

    if (type === "IEND") {
      sawIend = true;
      break;
    }
  }

  if (!sawIend) {
    addWarning(warnings, "missing-png-end");
  }

  return chunks;
}
