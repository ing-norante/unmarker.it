import type {
  MetadataImageFormat,
  MetadataSignal,
  MetadataWarning,
} from "@/lib/types";
import {
  addWarning,
  asciiBytes,
  buildCleanResult,
  bytesEqual,
  readAscii,
  readUint64,
  toDataView,
} from "../binary";
import { C2PA_UUID, createSignal, toScanResult } from "../markers";
import { visitEntry, type ParseContext } from "../context";
import { createInspection, type FormatInspection } from "../inspection";

export const JXL_CONTAINER_SIGNATURE = new Uint8Array([
  0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a,
]);
export const JXL_CODESTREAM_SIGNATURE = new Uint8Array([0xff, 0x0a]);

interface Box {
  type: string;
  start: number;
  dataStart: number;
  dataEnd: number;
  end: number;
  data: Uint8Array;
}

export function inferBoxContainerFormat(
  bytes: Uint8Array,
): MetadataImageFormat | null {
  if (isJxlBytes(bytes)) {
    return "jxl";
  }

  if (readAscii(bytes, 4, 4) !== "ftyp") {
    return null;
  }

  const brands = readAscii(bytes, 8, Math.min(64, bytes.length - 8));
  if (/\b(avif|avis)\b/.test(brands)) {
    return "avif";
  }
  if (/\b(heic|heix|hevc|hevx|mif1|msf1)\b/.test(brands)) {
    return "heif";
  }
  if (brands.includes("jxl ")) {
    return "jxl";
  }

  return null;
}

export function isJxlBytes(bytes: Uint8Array) {
  return (
    bytesEqual(
      bytes.subarray(0, JXL_CONTAINER_SIGNATURE.length),
      JXL_CONTAINER_SIGNATURE,
    ) ||
    bytesEqual(
      bytes.subarray(0, JXL_CODESTREAM_SIGNATURE.length),
      JXL_CODESTREAM_SIGNATURE,
    )
  );
}

export async function inspectBoxContainerMetadata(
  bytes: Uint8Array,
  format: MetadataImageFormat,
  context: ParseContext,
): Promise<FormatInspection> {
  context.checkpoint();
  const signals: MetadataSignal[] = [];
  const warnings: MetadataWarning[] = [];
  const startOffset = getBoxStartOffset(bytes, format, warnings);
  const boxes = startOffset === null ? [] : walkBoxes(bytes, startOffset, warnings, context);
  addCoverageWarning(boxes, warnings);
  const removedStarts = new Set<number>();
  for (const box of boxes) {
    await context.yieldIfNeeded();
    const signal = getBoxSignal(box);
    if (signal) {
      signals.push(signal);
      removedStarts.add(box.start);
    }
  }
  return createInspection(toScanResult(format, signals, warnings), (file, applyContext) => {
    const parts: Uint8Array[] = [];
    if (startOffset && startOffset > 0) parts.push(bytes.subarray(0, startOffset));
    for (const box of boxes) {
      applyContext.checkpoint();
      if (removedStarts.has(box.start)) {
        // Preserve offsets referenced by iloc/stco/co64; erase payload in place.
        const replacement = new Uint8Array(box.end - box.start);
        replacement.set(bytes.subarray(box.start, box.dataStart));
        replacement.set(asciiBytes("free"), 4);
        parts.push(replacement);
      } else parts.push(bytes.subarray(box.start, box.end));
    }
    return buildCleanResult(file, format, parts, removedStarts.size, warnings);
  });
}

function addCoverageWarning(boxes: Box[], warnings: MetadataWarning[]) {
  if (boxes.some(({ type }) => type === "meta" || type === "moov")) {
    addWarning(warnings, "box-item-coverage");
  }
}

function walkBoxes(
  bytes: Uint8Array,
  startOffset: number,
  warnings: MetadataWarning[],
  context: ParseContext,
): Box[] {
  const view = toDataView(bytes);
  const boxes: Box[] = [];
  let offset = startOffset;

  while (offset < bytes.length) {
    if (!visitEntry(context, warnings)) return boxes;
    if (offset + 8 > bytes.length) {
      addWarning(warnings, "incomplete-box-table");
      return boxes;
    }

    const size32 = view.getUint32(offset);
    const type = readAscii(bytes, offset + 4, 4);
    let headerSize = 8;
    let size = size32;

    if (size32 === 1) {
      if (offset + 16 > bytes.length) {
        addWarning(warnings, "incomplete-extended-box", { type });
        return boxes;
      }

      headerSize = 16;
      size = readUint64(view, offset + 8);
    } else if (size32 === 0) {
      size = bytes.length - offset;
    }

    if (size < headerSize || offset + size > bytes.length) {
      addWarning(warnings, "malformed-box-length", {
        type: type || "container",
      });
      return boxes;
    }

    boxes.push({
      type,
      start: offset,
      dataStart: offset + headerSize,
      dataEnd: offset + size,
      end: offset + size,
      data: bytes.subarray(offset + headerSize, offset + size),
    });

    offset += size;
  }

  return boxes;
}

function getBoxStartOffset(
  bytes: Uint8Array,
  format: MetadataImageFormat,
  warnings: MetadataWarning[],
) {
  if (format === "jxl") {
    if (
      bytesEqual(
        bytes.subarray(0, JXL_CONTAINER_SIGNATURE.length),
        JXL_CONTAINER_SIGNATURE,
      )
    ) {
      return JXL_CONTAINER_SIGNATURE.length;
    }

    if (
      bytesEqual(
        bytes.subarray(0, JXL_CODESTREAM_SIGNATURE.length),
        JXL_CODESTREAM_SIGNATURE,
      )
    ) {
      addWarning(
        warnings,
        "jxl-codestream-scan-only",
      );
      return null;
    }
  }

  if (readAscii(bytes, 4, 4) === "ftyp") {
    return 0;
  }

  addWarning(
    warnings,
    "container-not-walkable",
  );
  return null;
}

function getBoxSignal(box: Box): MetadataSignal | null {
  if (
    box.type === "uuid" &&
    box.data.length >= C2PA_UUID.length &&
    bytesEqual(box.data.subarray(0, C2PA_UUID.length), C2PA_UUID)
  ) {
    return createSignal(
      "c2pa",
      "metadata:signals.uuid",
      "ISOBMFF uuid",
      "c2pa",
    );
  }

  if (box.type === "jumb") {
    return createSignal(
      "isobmff-box",
      "metadata:signals.jumbf",
      "ISOBMFF jumb",
      "jumb",
    );
  }

  return null;
}
