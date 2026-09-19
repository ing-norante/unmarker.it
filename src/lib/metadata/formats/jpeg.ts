import type {
  MetadataImageFormat,
  MetadataSignal,
  MetadataSignalType,
  MetadataWarning,
} from "@/lib/types";
import {
  addWarning,
  buildCleanResult,
  bytesEqual,
  startsWithAscii,
  toDataView,
} from "../binary";
import {
  createSignal,
  findAiMarkers,
  markersContainC2pa,
  toScanResult,
} from "../markers";
import { visitEntry, type ParseContext } from "../context";
import { createInspection, type FormatInspection } from "../inspection";
import { containsMetadataText } from "../textScanner";

export const JPEG_SOI = new Uint8Array([0xff, 0xd8]);

interface JpegSegment {
  marker: number;
  start: number;
  payloadStart: number;
  payloadEnd: number;
  end: number;
  payload: Uint8Array;
}

export function isJpegBytes(bytes: Uint8Array) {
  return bytesEqual(bytes.subarray(0, JPEG_SOI.length), JPEG_SOI);
}

export async function inspectJpegMetadata(
  bytes: Uint8Array,
  format: MetadataImageFormat,
  context: ParseContext,
): Promise<FormatInspection> {
  const signals: MetadataSignal[] = [];
  const warnings: MetadataWarning[] = [];
  const segments = walkJpegSegments(bytes, warnings, context);
  const evidence = new Map<JpegSegment, string[]>();
  const c2paInstances = new Set<number>();
  for (const segment of segments) {
    await context.yieldIfNeeded();
    if (![0xe1, 0xeb, 0xed].includes(segment.marker)) continue;
    const markers = await findAiMarkers(segment.payload, context, warnings);
    evidence.set(segment, markers);
    const instance = app11Instance(segment);
    if (instance !== null && markersContainC2pa(markers)) c2paInstances.add(instance);
  }
  const removedStarts = new Set<number>();
  for (const segment of segments) {
    await context.yieldIfNeeded();
    const signal = getJpegSegmentSignal(segment, evidence.get(segment) ?? [], c2paInstances, context);
    if (signal) {
      signals.push(signal);
      if (signal.removable) removedStarts.add(segment.start);
      else addWarning(warnings, "display-metadata-preserved");
    }
  }
  return createInspection(toScanResult(format, signals, warnings), (file, applyContext) => {
    const parts: Uint8Array[] = [bytes.subarray(0, JPEG_SOI.length)];
    let cursor = JPEG_SOI.length;
    for (const segment of segments) {
      applyContext.checkpoint();
      if (cursor < segment.start) parts.push(bytes.subarray(cursor, segment.start));
      if (segment.marker === 0xda) { cursor = segment.start; break; }
      if (!removedStarts.has(segment.start)) parts.push(bytes.subarray(segment.start, segment.end));
      cursor = segment.end;
    }
    if (cursor < bytes.length) parts.push(bytes.subarray(cursor));
    return buildCleanResult(file, format, parts, removedStarts.size, warnings);
  });
}

function getJpegSegmentSignal(segment: JpegSegment, markers: string[], c2paInstances: Set<number>, context: ParseContext): MetadataSignal | null {

  const instance = app11Instance(segment);
  if (segment.marker === 0xeb && (markersContainC2pa(markers) || (instance !== null && c2paInstances.has(instance)))) {
    return createSignal(
      "c2pa",
      "metadata:signals.jpegC2pa",
      "JPEG APP11",
      ["c2pa", ...markers],
    );
  }

  if (segment.marker === 0xe1 && markers.length > 0) {
    const type = getJpegApp1SignalType(segment.payload, context);
    return createSignal(
      type,
      type === "xmp" ? "metadata:signals.xmp" : "metadata:signals.exif",
      type === "xmp" ? "JPEG APP1 XMP" : "JPEG APP1 EXIF",
      markers,
      // EXIF may own orientation, resolution and colour interpretation.
      // Preserve the segment until a field-level editor is available.
      type === "xmp" && !containsMetadataText(segment.payload, ["tiff:orientation"], context.checkpoint),
    );
  }

  if (segment.marker === 0xed && markers.length > 0) {
    return createSignal(
      "binary-marker",
      "metadata:signals.iptc",
      "JPEG APP13 IPTC",
      markers,
    );
  }

  return null;
}

function app11Instance(segment: JpegSegment): number | null {
  return segment.marker === 0xeb && segment.payload.length >= 8 && startsWithAscii(segment.payload, "JP")
    ? toDataView(segment.payload).getUint16(2) : null;
}

function getJpegApp1SignalType(payload: Uint8Array, context: ParseContext): MetadataSignalType {
  return startsWithAscii(payload, "http://ns.adobe.com/xap/1.0/") ||
    containsMetadataText(payload, ["xmpmeta", "rdf:"], context.checkpoint) ? "xmp" : "exif";
}

function walkJpegSegments(
  bytes: Uint8Array,
  warnings: MetadataWarning[],
  context: ParseContext,
): JpegSegment[] {
  context.checkpoint();
  if (!isJpegBytes(bytes)) {
    addWarning(warnings, "malformed-jpeg-signature");
    return [];
  }

  const view = toDataView(bytes);
  const segments: JpegSegment[] = [];
  let offset = JPEG_SOI.length;

  while (offset < bytes.length) {
    if (!visitEntry(context, warnings)) return segments;
    if (bytes[offset] !== 0xff) {
      addWarning(warnings, "malformed-jpeg-marker");
      return segments;
    }

    const start = offset;
    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }

    if (offset >= bytes.length) {
      addWarning(warnings, "malformed-jpeg-run");
      return segments;
    }

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9 || isStandaloneJpegMarker(marker)) {
      continue;
    }

    if (offset + 2 > bytes.length) {
      addWarning(warnings, "malformed-jpeg-length");
      return segments;
    }

    const length = view.getUint16(offset);
    if (length < 2) {
      addWarning(warnings, "malformed-jpeg-size");
      return segments;
    }

    const payloadStart = offset + 2;
    const payloadEnd = offset + length;
    const end = payloadEnd;

    if (end > bytes.length) {
      addWarning(warnings, "malformed-jpeg-payload");
      return segments;
    }

    segments.push({
      marker,
      start,
      payloadStart,
      payloadEnd,
      end,
      payload: bytes.subarray(payloadStart, payloadEnd),
    });

    offset = end;

    if (marker === 0xda) {
      break;
    }
  }

  return segments;
}

function isStandaloneJpegMarker(marker: number) {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}
