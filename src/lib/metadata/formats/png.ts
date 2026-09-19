import type {
  MetadataImageFormat,
  MetadataSignal,
  MetadataWarning,
} from "@/lib/types";
import {
  addWarning,
  buildCleanResult,
  bytesEqual,
  readAscii,
  toArrayBuffer,
  toDataView,
  unique,
} from "../binary";
import { createSignal, findAiMarkers, toScanResult } from "../markers";
import { visitEntry, type ParseContext } from "../context";
import { createInspection, type FormatInspection } from "../inspection";

export const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const PNG_TEXT_CHUNKS = new Set(["tEXt", "iTXt", "zTXt"]);
const C2PA_PNG_CHUNKS = new Set(["caBX"]);
export { PNG_TEXT_CHUNK_LIMIT, PNG_TEXT_TOTAL_LIMIT } from "../context";

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

export async function inspectPngMetadata(
  bytes: Uint8Array,
  format: MetadataImageFormat,
  context: ParseContext,
): Promise<FormatInspection> {
  const signals: MetadataSignal[] = [];
  const warnings: MetadataWarning[] = [];
  const chunks = walkPngChunks(bytes, warnings, context);
  const removedStarts = new Set<number>();

  for (const chunk of chunks) {
    await context.yieldIfNeeded();
    if (C2PA_PNG_CHUNKS.has(chunk.type)) {
      signals.push(createSignal("c2pa", "metadata:signals.pngC2pa", `PNG ${chunk.type}`, "c2pa"));
      removedStarts.add(chunk.start);
    } else if (PNG_TEXT_CHUNKS.has(chunk.type)) {
      const markers = await findPngTextMarkers(chunk, warnings, context);
      context.checkpoint();
      if (markers.length > 0) {
        signals.push(createSignal("png-text", "metadata:signals.pngText", `PNG ${chunk.type}`, markers));
        removedStarts.add(chunk.start);
      }
    }
  }

  return createInspection(toScanResult(format, signals, warnings), (file, applyContext) => {
    const parts: Uint8Array[] = [bytes.subarray(0, PNG_SIGNATURE.length)];
    for (const chunk of chunks) {
      applyContext.checkpoint();
      if (!removedStarts.has(chunk.start)) parts.push(bytes.subarray(chunk.start, chunk.end));
    }
    return buildCleanResult(file, format, parts, removedStarts.size, warnings);
  });
}

async function findPngTextMarkers(
  chunk: PngChunk,
  warnings: MetadataWarning[],
  context: ParseContext,
): Promise<string[]> {
  context.checkpoint();
  const limit = Math.min(context.budget.pngTextChunkBytes, context.budget.pngTextBytesRemaining);
  if (chunk.data.length > limit) {
    addWarning(warnings, "png-text-limit");
    return [];
  }
  context.budget.pngTextBytesRemaining -= chunk.data.length;
  // Compressed bytes are not text; scan the bounded keyword separately.
  const candidates = chunk.type === "tEXt" ? [chunk.data] : [];
  const keyEnd = chunk.data.indexOf(0);

  if (keyEnd > 0) {
    candidates.push(chunk.data.subarray(0, keyEnd));
  }

  if (chunk.type === "zTXt" && keyEnd >= 0 && keyEnd + 2 < chunk.data.length) {
    if (chunk.data[keyEnd + 1] !== 0) {
      addWarning(warnings, "png-decode-partial", { type: "PNG zTXt" });
      return [];
    }
    const inflated = await inflatePngText(
      chunk.data.subarray(keyEnd + 2),
      warnings,
      "PNG zTXt",
      context,
    );
    if (inflated) {
      candidates.push(inflated);
    }
  }

  if (chunk.type === "iTXt") {
    if (keyEnd < 0 || chunk.data[keyEnd + 1] > 1 || chunk.data[keyEnd + 2] !== 0) {
      addWarning(warnings, "png-decode-partial", { type: "PNG iTXt" });
      return [];
    }
    const textBytes = getItxtTextBytes(chunk.data);
    if (textBytes) {
      if (textBytes.compressed) {
        const inflated = await inflatePngText(
          textBytes.bytes,
          warnings,
          "PNG iTXt",
          context,
        );
        if (inflated) {
          candidates.push(inflated);
        }
      } else {
        candidates.push(textBytes.bytes);
      }
    }
  }

  context.checkpoint();
  const markers: string[] = [];
  for (const candidate of candidates) markers.push(...await findAiMarkers(candidate, context, warnings));
  return unique(markers);
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
  context: ParseContext,
): Promise<Uint8Array | null> {
  context.checkpoint();
  if (typeof DecompressionStream === "undefined") {
    addWarning(warnings, "png-compressed-scan-only", { type: label });
    return null;
  }

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let cancellation: Promise<void> | undefined;
  let finished = false;
  const cancel = () => {
    if (reader && !cancellation) cancellation = reader.cancel(context.signal?.reason).catch(() => undefined);
  };
  try {
    const stream = new Blob([toArrayBuffer(data)]).stream().pipeThrough(new DecompressionStream("deflate"));
    reader = stream.getReader();
    context.signal?.addEventListener("abort", cancel, { once: true });
    context.checkpoint();
    const limit = Math.min(context.budget.pngTextChunkBytes, context.budget.pngTextBytesRemaining);
    const parts: Uint8Array[] = [];
    let length = 0;
    while (true) {
      context.checkpoint();
      const { done, value } = await reader.read();
      context.checkpoint();
      if (done) { finished = true; break; }
      length += value.byteLength;
      if (length > limit) {
        context.budget.pngTextBytesRemaining = Math.max(0, context.budget.pngTextBytesRemaining - limit);
        addWarning(warnings, "png-text-limit");
        return null;
      }
      parts.push(value);
      await context.yieldIfNeeded();
    }
    context.budget.pngTextBytesRemaining -= length;
    const output = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      context.checkpoint();
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  } catch {
    context.checkpoint(); // Cancellation is not corruption and must propagate.
    addWarning(warnings, "png-decode-partial", { type: label });
    return null;
  } finally {
    context.signal?.removeEventListener("abort", cancel);
    if (!finished) cancel();
    await cancellation;
    reader?.releaseLock();
  }
}

function walkPngChunks(bytes: Uint8Array, warnings: MetadataWarning[], context: ParseContext): PngChunk[] {
  context.checkpoint();
  if (!isPngBytes(bytes)) {
    addWarning(warnings, "malformed-png-signature");
    return [];
  }

  const view = toDataView(bytes);
  const chunks: PngChunk[] = [];
  let offset = PNG_SIGNATURE.length;
  let sawIend = false;

  while (offset < bytes.length) {
    if (!visitEntry(context, warnings)) return chunks;
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
      if (length !== 0 || end !== bytes.length) {
        addWarning(warnings, "malformed-png-table");
      }
      break;
    }
  }

  if (!sawIend) {
    addWarning(warnings, "missing-png-end");
  }

  return chunks;
}
