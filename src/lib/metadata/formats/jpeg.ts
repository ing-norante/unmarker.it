import type {
  MetadataCleanResult,
  MetadataImageFormat,
  MetadataScanResult,
  MetadataSignal,
  MetadataSignalType,
} from "@/lib/types";
import {
  addWarning,
  buildCleanResult,
  bytesEqual,
  originalCleanResult,
  startsWithAscii,
  toDataView,
} from "../binary";
import {
  bytesToSearchText,
  createSignal,
  findAiMarkers,
  markersContainC2pa,
  toScanResult,
} from "../markers";

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

export function scanJpegMetadata(
  bytes: Uint8Array,
  format: MetadataImageFormat,
): MetadataScanResult {
  const signals: MetadataSignal[] = [];
  const warnings: string[] = [];
  const segments = walkJpegSegments(bytes, warnings);

  for (const segment of segments) {
    const signal = getJpegSegmentSignal(segment);
    if (signal) {
      signals.push(signal);
    }
  }

  return toScanResult(format, signals, warnings);
}

export function cleanJpegMetadata(
  file: File,
  bytes: Uint8Array,
): MetadataCleanResult {
  const warnings: string[] = [];
  const segments = walkJpegSegments(bytes, warnings);

  if (segments.length === 0 || warnings.length > 0) {
    return originalCleanResult(file, "jpeg", warnings);
  }

  const parts: Uint8Array[] = [bytes.subarray(0, JPEG_SOI.length)];
  let cursor = JPEG_SOI.length;
  let removedCount = 0;
  let copiedRemainder = false;

  for (const segment of segments) {
    if (segment.marker === 0xda) {
      parts.push(bytes.subarray(segment.start));
      copiedRemainder = true;
      break;
    }

    if (cursor < segment.start) {
      parts.push(bytes.subarray(cursor, segment.start));
    }

    if (getJpegSegmentSignal(segment)) {
      removedCount += 1;
    } else {
      parts.push(bytes.subarray(segment.start, segment.end));
    }

    cursor = segment.end;
  }

  if (!copiedRemainder && cursor < bytes.length) {
    parts.push(bytes.subarray(cursor));
  }

  return buildCleanResult(file, "jpeg", parts, removedCount, warnings);
}

function getJpegSegmentSignal(segment: JpegSegment): MetadataSignal | null {
  const markers = findAiMarkers(segment.payload);

  if (segment.marker === 0xeb && markersContainC2pa(markers)) {
    return createSignal(
      "c2pa",
      "JPEG APP11 C2PA segment",
      "JPEG APP11",
      "c2pa",
    );
  }

  if (segment.marker === 0xe1 && markers.length > 0) {
    const type = getJpegApp1SignalType(segment.payload);
    return createSignal(
      type,
      type === "xmp" ? "XMP AI marker" : "EXIF AI marker",
      type === "xmp" ? "JPEG APP1 XMP" : "JPEG APP1 EXIF",
      markers[0],
    );
  }

  if (segment.marker === 0xed && markers.length > 0) {
    return createSignal(
      "binary-marker",
      "IPTC AI marker",
      "JPEG APP13 IPTC",
      markers[0],
    );
  }

  return null;
}

function getJpegApp1SignalType(payload: Uint8Array): MetadataSignalType {
  const text = bytesToSearchText(payload);

  if (
    startsWithAscii(payload, "http://ns.adobe.com/xap/1.0/") ||
    text.includes("xmpmeta") ||
    text.includes("rdf:")
  ) {
    return "xmp";
  }

  return "exif";
}

function walkJpegSegments(
  bytes: Uint8Array,
  warnings: string[],
): JpegSegment[] {
  if (!isJpegBytes(bytes)) {
    addWarning(warnings, "Malformed JPEG signature.");
    return [];
  }

  const view = toDataView(bytes);
  const segments: JpegSegment[] = [];
  let offset = JPEG_SOI.length;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      addWarning(warnings, "Malformed JPEG segment marker.");
      return segments;
    }

    const start = offset;
    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }

    if (offset >= bytes.length) {
      addWarning(warnings, "Malformed JPEG marker run.");
      return segments;
    }

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9 || isStandaloneJpegMarker(marker)) {
      continue;
    }

    if (offset + 2 > bytes.length) {
      addWarning(warnings, "Malformed JPEG segment length.");
      return segments;
    }

    const length = view.getUint16(offset);
    if (length < 2) {
      addWarning(warnings, "Malformed JPEG segment size.");
      return segments;
    }

    const payloadStart = offset + 2;
    const payloadEnd = offset + length;
    const end = payloadEnd;

    if (end > bytes.length) {
      addWarning(warnings, "Malformed JPEG segment payload.");
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
