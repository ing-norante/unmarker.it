import type {
  MetadataImageFormat,
  MetadataScanResult,
  MetadataSignal,
  MetadataSignalType,
  MetadataWarning,
} from "@/lib/types";
import type { MessageKey } from "@/i18n/messages";
import { message } from "@/i18n/messages";
import { containsByteSequence, unique } from "./binary";
import { boundedMetadataBytes, type ParseContext } from "./context";
import { findTextMarkersAsync, TEXT_SCAN_BLOCK_BYTES } from "./textScanner";

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
  "dcterms:provenance",
  "trainedAlgorithmicMedia",
  "compositeSynthetic",
  "algorithmicMedia",
  "compositeWithTrainedAlgorithmicMedia",
];

export async function findAiMarkers(input: Uint8Array, context: ParseContext, warnings: MetadataWarning[] = []): Promise<string[]> {
  const bytes = boundedMetadataBytes(input, context, warnings);
  const markers = new Set<string>();

  for (let offset = 0; offset < bytes.length; offset += TEXT_SCAN_BLOCK_BYTES) {
    await context.yieldIfNeeded();
    if (containsByteSequence(bytes.subarray(offset, offset + TEXT_SCAN_BLOCK_BYTES + C2PA_UUID.length - 1), C2PA_UUID)) {
      markers.add("C2PA UUID");
      break;
    }
  }

  for (const marker of await findTextMarkersAsync(bytes, AI_TEXT_MARKERS, context)) markers.add(marker);

  return [...markers];
}

export function createSignal(
  type: MetadataSignalType,
  label: MessageKey,
  location: string,
  evidence?: string | string[],
  removable = true,
): MetadataSignal {
  const markers = typeof evidence === "string" ? [evidence] : unique(evidence ?? []);
  return {
    type,
    label: message(label),
    location,
    marker: markers[0],
    markers,
    removable,
  };
}

export function toScanResult(
  format: MetadataImageFormat,
  signals: MetadataSignal[],
  warnings: MetadataWarning[],
): MetadataScanResult {
  return {
    hasAiMetadata: signals.some(isAiMetadataSignal),
    format,
    signals,
    warnings,
  };
}

export function markersContainC2pa(markers: string[]) {
  return markers.some((marker) => marker.toLowerCase().includes("c2pa"));
}

export function signalMarkers(signal: MetadataSignal): string[] {
  return signal.markers ?? (signal.marker ? [signal.marker] : []);
}

export function hasC2paEvidence(signal: MetadataSignal): boolean {
  return signal.type === "c2pa" || signal.type === "isobmff-box" ||
    signalMarkers(signal).some((marker) => /c2pa|dcterms:provenance/i.test(marker));
}

/** C2PA describes provenance and also appears in ordinary camera photographs. */
export function isAiMetadataSignal(signal: MetadataSignal) {
  if (signal.type === "c2pa" || signal.type === "isobmff-box") return false;
  return signalMarkers(signal).some((marker) => !/^(?:c2pa(?: uuid)?|dcterms:provenance|algorithmicMedia|compositeSynthetic)$/i.test(marker));
}

export function hasBlockingCleanWarning(warnings: MetadataWarning[]) {
  return warnings.some(({ code }) => code !== "box-item-coverage" && code !== "display-metadata-preserved");
}
