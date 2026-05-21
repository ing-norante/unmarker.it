import type {
  MetadataCleanResult,
  MetadataImageFormat,
  MetadataScanResult,
  MetadataSignal,
} from "@/lib/types";
import {
  addWarning,
  buildCleanResult,
  bytesEqual,
  originalCleanResult,
  readAscii,
  readUint64,
  toDataView,
} from "../binary";
import { C2PA_UUID, createSignal, toScanResult } from "../markers";

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

export function scanBoxContainerMetadata(
  bytes: Uint8Array,
  format: MetadataImageFormat,
): MetadataScanResult {
  const signals: MetadataSignal[] = [];
  const warnings: string[] = [];
  const startOffset = getBoxStartOffset(bytes, format, warnings);

  if (startOffset === null) {
    return toScanResult(format, signals, warnings);
  }

  const boxes = walkBoxes(bytes, startOffset, warnings);

  for (const box of boxes) {
    const signal = getBoxSignal(box);
    if (signal) {
      signals.push(signal);
    }
  }

  return toScanResult(format, signals, warnings);
}

export function cleanBoxContainerMetadata(
  file: File,
  bytes: Uint8Array,
  format: MetadataImageFormat,
): MetadataCleanResult {
  const warnings: string[] = [];
  const startOffset = getBoxStartOffset(bytes, format, warnings);

  if (startOffset === null) {
    return originalCleanResult(file, format, warnings);
  }

  const boxes = walkBoxes(bytes, startOffset, warnings);

  if (boxes.length === 0 || warnings.length > 0) {
    return originalCleanResult(file, format, warnings);
  }

  const parts: Uint8Array[] = [];
  let removedCount = 0;

  if (startOffset > 0) {
    parts.push(bytes.subarray(0, startOffset));
  }

  for (const box of boxes) {
    if (getBoxSignal(box)) {
      removedCount += 1;
      continue;
    }

    parts.push(bytes.subarray(box.start, box.end));
  }

  return buildCleanResult(file, format, parts, removedCount, warnings);
}

function walkBoxes(
  bytes: Uint8Array,
  startOffset: number,
  warnings: string[],
): Box[] {
  const view = toDataView(bytes);
  const boxes: Box[] = [];
  let offset = startOffset;

  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) {
      addWarning(warnings, "Container box table is incomplete.");
      return boxes;
    }

    const size32 = view.getUint32(offset);
    const type = readAscii(bytes, offset + 4, 4);
    let headerSize = 8;
    let size = size32;

    if (size32 === 1) {
      if (offset + 16 > bytes.length) {
        addWarning(warnings, `Extended-size ${type} box is incomplete.`);
        return boxes;
      }

      headerSize = 16;
      size = readUint64(view, offset + 8);
    } else if (size32 === 0) {
      size = bytes.length - offset;
    }

    if (size < headerSize || offset + size > bytes.length) {
      addWarning(warnings, `Malformed ${type || "container"} box length.`);
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
  warnings: string[],
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
        "JPEG XL codestream is scan-only; box cleaning is available for JXL containers only.",
      );
      return null;
    }
  }

  if (readAscii(bytes, 4, 4) === "ftyp") {
    return 0;
  }

  addWarning(
    warnings,
    "Container is not box-walkable; scan is partial and cleaning is disabled.",
  );
  return null;
}

function getBoxSignal(box: Box): MetadataSignal | null {
  if (
    box.type === "uuid" &&
    box.data.length >= C2PA_UUID.length &&
    bytesEqual(box.data.subarray(0, C2PA_UUID.length), C2PA_UUID)
  ) {
    return createSignal("c2pa", "C2PA UUID box", "ISOBMFF uuid", "c2pa");
  }

  if (box.type === "jumb") {
    return createSignal(
      "isobmff-box",
      "JUMBF metadata box",
      "ISOBMFF jumb",
      "jumb",
    );
  }

  return null;
}
