import {
  inferBoxContainerFormat,
  inspectBoxContainerMetadata,
} from "@/lib/metadata/formats/boxContainer";
import {
  isJpegBytes,
  inspectJpegMetadata,
} from "@/lib/metadata/formats/jpeg";
import {
  isPngBytes,
  inspectPngMetadata,
} from "@/lib/metadata/formats/png";
import {
  isWebpBytes,
  inspectWebpMetadata,
} from "@/lib/metadata/formats/webp";
import {
  getLowerExtension,
  originalCleanResult,
} from "@/lib/metadata/binary";
import {
  createSignal,
  findAiMarkers,
  hasBlockingCleanWarning,
  hasC2paEvidence,
  toScanResult,
} from "@/lib/metadata/markers";
import type {
  MetadataCleanResult,
  MetadataImageFormat,
  MetadataScanResult,
} from "./types";
import { readLocalC2pa } from "./c2pa/runtime";
import { createParseContext, type MetadataParseOptions, type ParseContext } from "./metadata/context";
import type { FormatInspection } from "./metadata/inspection";

export async function scanImageMetadata(
  file: File,
  options: MetadataParseOptions = {},
): Promise<MetadataScanResult> {
  const context = createParseContext(options);
  // Drop the binary plan immediately; scans never retain image bytes in results.
  const { scan: result } = await inspectFile(file, context);
  context.checkpoint();
  if (result.signals.some(hasC2paEvidence)) {
    const presence = result.signals.some(({ type }) => type === "c2pa") ? "present" : "referenced";
    result.c2pa = await readLocalC2pa(file, presence, context.signal);
    context.checkpoint();
    result.hasAiMetadata ||= Boolean(result.c2pa.aiDisclosure);
  }
  return result;
}

export async function cleanImageMetadata(
  file: File,
  options: MetadataParseOptions = {},
): Promise<MetadataCleanResult> {
  const context = createParseContext(options);
  const inspection = await inspectFile(file, context);
  // All format-specific classification/decompression runs exactly once. C2PA
  // enrichment is independent of binary removal and is unnecessary here.
  context.checkpoint();
  return inspection.apply(file, context);
}

async function inspectFile(file: File, context: ParseContext): Promise<FormatInspection> {
  context.checkpoint();
  const buffer = await file.arrayBuffer();
  context.checkpoint(); // Blob reads themselves cannot be aborted; do not start parsing afterwards.
  return inspectBytes(file, new Uint8Array(buffer), context);
}

export function canCleanMetadata(result: MetadataScanResult | null) {
  return Boolean(
    result?.signals.some((signal) => signal.removable) &&
      !hasBlockingCleanWarning(result.warnings),
  );
}

function inspectBytes(file: File, bytes: Uint8Array, context: ParseContext): Promise<FormatInspection> {
  const format = inferFormat(file, bytes);
  switch (format) {
    case "png": return inspectPngMetadata(bytes, format, context);
    case "jpeg": return inspectJpegMetadata(bytes, format, context);
    case "webp": return inspectWebpMetadata(bytes, format, context);
    case "avif":
    case "heif":
    case "jxl": return inspectBoxContainerMetadata(bytes, format, context);
    default: return Promise.resolve(inspectUnknown(bytes, format, context));
  }
}

async function inspectUnknown(bytes: Uint8Array, format: MetadataImageFormat, context: ParseContext): Promise<FormatInspection> {
  const warnings: MetadataScanResult["warnings"] = [{ code: "unsupported-scan" }];
  const markers = await findAiMarkers(bytes, context, warnings);
  // In an unknown container the UUID cannot establish ownership of surrounding
  // text. Keep credential structure separate from independent AI/provider clues.
  const signals = markers.includes("C2PA UUID") ? [createSignal(
    "c2pa", "metadata:signals.binary", "file bytes", "C2PA UUID", false,
  )] : [];
  const textMarkers = markers.filter((marker) => marker !== "C2PA UUID");
  if (textMarkers.length > 0) signals.push(createSignal(
    "binary-marker", "metadata:signals.binary", "file bytes", textMarkers, false,
  ));
  return {
    scan: toScanResult(format, signals, warnings),
    apply(file, applyContext) {
      applyContext.checkpoint();
      return originalCleanResult(file, format, [...warnings, { code: "unsupported-clean" }]);
    },
  };
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
