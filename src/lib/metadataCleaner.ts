import {
  cleanBoxContainerMetadata,
  inferBoxContainerFormat,
  scanBoxContainerMetadata,
} from "@/lib/metadata/formats/boxContainer";
import {
  cleanJpegMetadata,
  isJpegBytes,
  scanJpegMetadata,
} from "@/lib/metadata/formats/jpeg";
import {
  cleanPngMetadata,
  isPngBytes,
  scanPngMetadata,
} from "@/lib/metadata/formats/png";
import {
  cleanWebpMetadata,
  isWebpBytes,
  scanWebpMetadata,
} from "@/lib/metadata/formats/webp";
import {
  getLowerExtension,
  originalCleanResult,
} from "@/lib/metadata/binary";
import {
  createSignal,
  findAiMarkers,
  hasBlockingCleanWarning,
  toScanResult,
} from "@/lib/metadata/markers";
import type {
  MetadataCleanResult,
  MetadataImageFormat,
  MetadataScanResult,
} from "./types";

export async function scanImageMetadata(
  file: File,
): Promise<MetadataScanResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return scanBytes(file, bytes);
}

export async function cleanImageMetadata(
  file: File,
): Promise<MetadataCleanResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = inferFormat(file, bytes);

  switch (format) {
    case "png":
      return cleanPngMetadata(file, bytes);
    case "jpeg":
      return cleanJpegMetadata(file, bytes);
    case "webp":
      return cleanWebpMetadata(file, bytes);
    case "avif":
    case "heif":
    case "jxl":
      return cleanBoxContainerMetadata(file, bytes, format);
    default:
      return originalCleanResult(file, format, [
        "Unsupported format; cleaning is disabled for this file.",
      ]);
  }
}

export function canCleanMetadata(result: MetadataScanResult | null) {
  return Boolean(
    result?.signals.some((signal) => signal.removable) &&
      !hasBlockingCleanWarning(result.warnings),
  );
}

function scanBytes(file: File, bytes: Uint8Array): Promise<MetadataScanResult> {
  const format = inferFormat(file, bytes);

  switch (format) {
    case "png":
      return scanPngMetadata(bytes, format);
    case "jpeg":
      return Promise.resolve(scanJpegMetadata(bytes, format));
    case "webp":
      return Promise.resolve(scanWebpMetadata(bytes, format));
    case "avif":
    case "heif":
    case "jxl":
      return Promise.resolve(scanBoxContainerMetadata(bytes, format));
    default:
      return Promise.resolve(scanUnknown(bytes, format));
  }
}

function scanUnknown(
  bytes: Uint8Array,
  format: MetadataImageFormat,
): MetadataScanResult {
  const warnings = [
    "Unsupported format; scan is byte-signature only and cleaning is disabled.",
  ];
  const markers = findAiMarkers(bytes);
  const signals = markers.map((marker) =>
    createSignal(
      marker === "C2PA UUID" ? "c2pa" : "binary-marker",
      "Binary AI marker",
      "file bytes",
      marker,
      false,
    ),
  );

  return toScanResult(format, signals, warnings);
}

function inferFormat(file: File, bytes: Uint8Array): MetadataImageFormat {
  if (isPngBytes(bytes)) {
    return "png";
  }

  if (isJpegBytes(bytes)) {
    return "jpeg";
  }

  if (isWebpBytes(bytes)) {
    return "webp";
  }

  const boxFormat = inferBoxContainerFormat(bytes);
  if (boxFormat) {
    return boxFormat;
  }

  const extension = getLowerExtension(file.name);
  const mime = file.type.toLowerCase();

  if (extension === "jpg" || extension === "jpeg" || mime === "image/jpeg") {
    return "jpeg";
  }
  if (extension === "png" || mime === "image/png") {
    return "png";
  }
  if (extension === "webp" || mime === "image/webp") {
    return "webp";
  }
  if (extension === "avif" || mime === "image/avif") {
    return "avif";
  }
  if (
    extension === "heif" ||
    extension === "heic" ||
    mime === "image/heif" ||
    mime === "image/heic"
  ) {
    return "heif";
  }
  if (extension === "jxl" || mime === "image/jxl") {
    return "jxl";
  }

  return "unknown";
}
