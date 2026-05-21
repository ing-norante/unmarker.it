import type {
  MetadataImageFormat,
  MetadataScanResult,
  MetadataSignal,
  MetadataSignalType,
} from "@/lib/types";
import { containsByteSequence, unique } from "./binary";

export const C2PA_UUID = new Uint8Array([
  0xd8, 0xfe, 0xc3, 0xd6, 0x1b, 0x0e, 0x48, 0x3c, 0x92, 0x97, 0x58, 0x28, 0x87,
  0x7e, 0xc4, 0x81,
]);

const AI_TEXT_MARKERS = [
  "parameters",
  "prompt",
  "negative_prompt",
  "workflow",
  "comfyui",
  "generation_data",
  "stable_diffusion",
  "stable diffusion",
  "automatic1111",
  "midjourney",
  "dall-e",
  "dall e",
  "dalle",
  "imagen",
  "synthid",
  "google_ai",
  "google ai",
  "openai",
  "firefly",
  "c2pa",
  "trainedAlgorithmicMedia",
  "compositeSynthetic",
  "algorithmicMedia",
  "compositeWithTrainedAlgorithmicMedia",
];

export function findAiMarkers(bytes: Uint8Array): string[] {
  const markers = new Set<string>();

  if (containsByteSequence(bytes, C2PA_UUID)) {
    markers.add("C2PA UUID");
  }

  const text = bytesToSearchText(bytes);
  const normalized = normalizeMarkerText(text);

  for (const marker of AI_TEXT_MARKERS) {
    const lowerMarker = marker.toLowerCase();
    const normalizedMarker = normalizeMarkerText(lowerMarker);

    if (text.includes(lowerMarker) || normalized.includes(normalizedMarker)) {
      markers.add(marker);
    }
  }

  const sdMatches = text.match(/\bsd:[a-z0-9_:-]+/g);
  if (sdMatches) {
    markers.add(sdMatches[0]);
  }

  return [...markers];
}

export function bytesToSearchText(bytes: Uint8Array) {
  return unique([
    decodeBytes(bytes, "utf-8"),
    decodeBytes(bytes, "iso-8859-1"),
    decodeBytes(bytes, "utf-16le"),
    decodeBytes(bytes, "utf-16be"),
  ])
    .join("\n")
    .replace(/\0/g, "")
    .toLowerCase();
}

export function createSignal(
  type: MetadataSignalType,
  label: string,
  location: string,
  marker?: string,
  removable = true,
): MetadataSignal {
  return {
    type,
    label,
    location,
    marker,
    removable,
  };
}

export function toScanResult(
  format: MetadataImageFormat,
  signals: MetadataSignal[],
  warnings: string[],
): MetadataScanResult {
  return {
    hasAiMetadata: signals.length > 0,
    format,
    signals,
    warnings: unique(warnings),
  };
}

export function markersContainC2pa(markers: string[]) {
  return markers.some((marker) => marker.toLowerCase().includes("c2pa"));
}

export function hasBlockingCleanWarning(warnings: string[]) {
  return warnings.some((warning) =>
    /unsupported|scan-only|malformed|not box-walkable|incomplete|exceeds file length/i.test(
      warning,
    ),
  );
}

function normalizeMarkerText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9:*]+/g, "_");
}

function decodeBytes(bytes: Uint8Array, label: string) {
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return "";
  }
}
