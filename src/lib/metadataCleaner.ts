import type {
  MetadataCleanResult,
  MetadataImageFormat,
  MetadataScanResult,
  MetadataSignal,
  MetadataSignalType,
} from "./types";

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_SOI = new Uint8Array([0xff, 0xd8]);
const RIFF_SIGNATURE = "RIFF";
const WEBP_SIGNATURE = "WEBP";
const JXL_CONTAINER_SIGNATURE = new Uint8Array([
  0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a,
]);
const JXL_CODESTREAM_SIGNATURE = new Uint8Array([0xff, 0x0a]);
const C2PA_UUID = new Uint8Array([
  0xd8, 0xfe, 0xc3, 0xd6, 0x1b, 0x0e, 0x48, 0x3c, 0x92, 0x97, 0x58, 0x28, 0x87,
  0x7e, 0xc4, 0x81,
]);

const PNG_TEXT_CHUNKS = new Set(["tEXt", "iTXt", "zTXt"]);
const C2PA_PNG_CHUNKS = new Set(["caBX"]);

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

interface PngChunk {
  type: string;
  start: number;
  dataStart: number;
  dataEnd: number;
  end: number;
  data: Uint8Array;
}

interface JpegSegment {
  marker: number;
  start: number;
  payloadStart: number;
  payloadEnd: number;
  end: number;
  payload: Uint8Array;
}

interface RiffChunk {
  type: string;
  start: number;
  dataStart: number;
  dataEnd: number;
  end: number;
  data: Uint8Array;
}

interface Box {
  type: string;
  start: number;
  dataStart: number;
  dataEnd: number;
  end: number;
  data: Uint8Array;
}

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
      return cleanPng(file, bytes);
    case "jpeg":
      return cleanJpeg(file, bytes);
    case "webp":
      return cleanWebp(file, bytes);
    case "avif":
    case "heif":
    case "jxl":
      return cleanBoxContainer(file, bytes, format);
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
      return scanPng(bytes, format);
    case "jpeg":
      return Promise.resolve(scanJpeg(bytes, format));
    case "webp":
      return Promise.resolve(scanWebp(bytes, format));
    case "avif":
    case "heif":
    case "jxl":
      return Promise.resolve(scanBoxContainer(bytes, format));
    default:
      return Promise.resolve(scanUnknown(bytes, format));
  }
}

async function scanPng(
  bytes: Uint8Array,
  format: MetadataImageFormat,
): Promise<MetadataScanResult> {
  const signals: MetadataSignal[] = [];
  const warnings: string[] = [];
  const chunks = walkPngChunks(bytes, warnings);

  for (const chunk of chunks) {
    if (C2PA_PNG_CHUNKS.has(chunk.type)) {
      signals.push(
        createSignal("c2pa", "C2PA PNG chunk", `PNG ${chunk.type}`, "c2pa"),
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
          "PNG text AI marker",
          `PNG ${chunk.type}`,
          markers[0],
        ),
      );
    }
  }

  return toScanResult(format, signals, warnings);
}

async function cleanPng(
  file: File,
  bytes: Uint8Array,
): Promise<MetadataCleanResult> {
  const warnings: string[] = [];
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

function scanJpeg(
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

function cleanJpeg(file: File, bytes: Uint8Array): MetadataCleanResult {
  const warnings: string[] = [];
  const segments = walkJpegSegments(bytes, warnings);

  if (segments.length === 0 || warnings.length > 0) {
    return originalCleanResult(file, "jpeg", warnings);
  }

  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let cursor = 2;
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

function scanWebp(
  bytes: Uint8Array,
  format: MetadataImageFormat,
): MetadataScanResult {
  const signals: MetadataSignal[] = [];
  const warnings: string[] = [];
  const chunks = walkRiffChunks(bytes, warnings);

  for (const chunk of chunks) {
    const signal = getWebpChunkSignal(chunk);
    if (signal) {
      signals.push(signal);
    }
  }

  return toScanResult(format, signals, warnings);
}

function cleanWebp(file: File, bytes: Uint8Array): MetadataCleanResult {
  const warnings: string[] = [];
  const chunks = walkRiffChunks(bytes, warnings);

  if (chunks.length === 0 || warnings.length > 0) {
    return originalCleanResult(file, "webp", warnings);
  }

  const keptChunks: Uint8Array[] = [];
  let removedCount = 0;

  for (const chunk of chunks) {
    if (getWebpChunkSignal(chunk)) {
      removedCount += 1;
      continue;
    }

    keptChunks.push(bytes.subarray(chunk.start, chunk.end));
  }

  if (removedCount === 0) {
    return buildCleanResult(file, "webp", [bytes], 0, warnings);
  }

  const body = concatUint8Arrays(keptChunks);
  const output = new Uint8Array(12 + body.length);
  output.set(asciiBytes(RIFF_SIGNATURE), 0);
  writeUint32Le(output, 4, output.length - 8);
  output.set(asciiBytes(WEBP_SIGNATURE), 8);
  output.set(body, 12);

  return buildCleanResult(file, "webp", [output], removedCount, warnings);
}

function scanBoxContainer(
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

function cleanBoxContainer(
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

function getWebpChunkSignal(chunk: RiffChunk): MetadataSignal | null {
  if (chunk.type !== "EXIF" && chunk.type !== "XMP ") {
    return null;
  }

  const markers = findAiMarkers(chunk.data);
  if (markers.length === 0) {
    return null;
  }

  return createSignal(
    "webp-metadata",
    "WebP metadata AI marker",
    `WebP ${chunk.type.trim()}`,
    markers[0],
  );
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

async function findPngTextMarkers(
  chunk: PngChunk,
  warnings: string[],
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
  warnings: string[],
  label: string,
): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") {
    addWarning(
      warnings,
      `${label} is compressed; this browser cannot inflate it, so only visible chunk bytes were scanned.`,
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
      `${label} could not be inflated; only visible chunk bytes were scanned.`,
    );
    return null;
  }
}

function walkPngChunks(bytes: Uint8Array, warnings: string[]): PngChunk[] {
  if (!bytesEqual(bytes.subarray(0, PNG_SIGNATURE.length), PNG_SIGNATURE)) {
    addWarning(warnings, "Malformed PNG signature.");
    return [];
  }

  const view = toDataView(bytes);
  const chunks: PngChunk[] = [];
  let offset = PNG_SIGNATURE.length;
  let sawIend = false;

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) {
      addWarning(warnings, "Malformed PNG chunk table.");
      return chunks;
    }

    const length = view.getUint32(offset);
    const type = readAscii(bytes, offset + 4, 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const end = dataEnd + 4;

    if (end > bytes.length) {
      addWarning(warnings, `Malformed PNG ${type || "chunk"} length.`);
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
    addWarning(warnings, "Malformed PNG is missing an IEND chunk.");
  }

  return chunks;
}

function walkJpegSegments(
  bytes: Uint8Array,
  warnings: string[],
): JpegSegment[] {
  if (!bytesEqual(bytes.subarray(0, JPEG_SOI.length), JPEG_SOI)) {
    addWarning(warnings, "Malformed JPEG signature.");
    return [];
  }

  const view = toDataView(bytes);
  const segments: JpegSegment[] = [];
  let offset = 2;

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

function walkRiffChunks(bytes: Uint8Array, warnings: string[]): RiffChunk[] {
  if (
    readAscii(bytes, 0, 4) !== RIFF_SIGNATURE ||
    readAscii(bytes, 8, 4) !== WEBP_SIGNATURE
  ) {
    addWarning(warnings, "Malformed WebP RIFF header.");
    return [];
  }

  const view = toDataView(bytes);
  const riffEnd = Math.min(bytes.length, view.getUint32(4, true) + 8);
  const chunks: RiffChunk[] = [];
  let offset = 12;

  if (riffEnd > bytes.length) {
    addWarning(warnings, "WebP RIFF size exceeds file length.");
    return chunks;
  }

  while (offset < riffEnd) {
    if (offset + 8 > riffEnd) {
      addWarning(warnings, "Malformed WebP chunk table.");
      return chunks;
    }

    const type = readAscii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    const end = dataEnd + (size % 2);

    if (end > riffEnd) {
      addWarning(warnings, `Malformed WebP ${type.trim()} chunk length.`);
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
  }

  return chunks;
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

function inferFormat(file: File, bytes: Uint8Array): MetadataImageFormat {
  if (bytesEqual(bytes.subarray(0, PNG_SIGNATURE.length), PNG_SIGNATURE)) {
    return "png";
  }

  if (bytesEqual(bytes.subarray(0, JPEG_SOI.length), JPEG_SOI)) {
    return "jpeg";
  }

  if (
    readAscii(bytes, 0, 4) === RIFF_SIGNATURE &&
    readAscii(bytes, 8, 4) === WEBP_SIGNATURE
  ) {
    return "webp";
  }

  if (
    bytesEqual(
      bytes.subarray(0, JXL_CONTAINER_SIGNATURE.length),
      JXL_CONTAINER_SIGNATURE,
    ) ||
    bytesEqual(
      bytes.subarray(0, JXL_CODESTREAM_SIGNATURE.length),
      JXL_CODESTREAM_SIGNATURE,
    )
  ) {
    return "jxl";
  }

  if (readAscii(bytes, 4, 4) === "ftyp") {
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

function findAiMarkers(bytes: Uint8Array): string[] {
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

function bytesToSearchText(bytes: Uint8Array) {
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

function createSignal(
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

function toScanResult(
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

function buildCleanResult(
  file: File,
  format: MetadataImageFormat,
  parts: Uint8Array[],
  removedCount: number,
  warnings: string[],
): MetadataCleanResult {
  const output = concatUint8Arrays(parts);
  return {
    blob: new Blob([toArrayBuffer(output)], {
      type: getMimeType(file, format),
    }),
    fileName: getCleanFileName(file, format),
    format,
    removedCount,
    warnings: unique(warnings),
  };
}

function originalCleanResult(
  file: File,
  format: MetadataImageFormat,
  warnings: string[],
): MetadataCleanResult {
  return {
    blob: file,
    fileName: getCleanFileName(file, format),
    format,
    removedCount: 0,
    warnings: unique(warnings),
  };
}

function getCleanFileName(file: File, format: MetadataImageFormat) {
  const dot = file.name.lastIndexOf(".");
  const hasExtension = dot > 0 && dot < file.name.length - 1;
  const base = hasExtension ? file.name.slice(0, dot) : file.name || "image";
  const extension = hasExtension
    ? file.name.slice(dot)
    : `.${extensionForFormat(format)}`;

  return `${base}-metadata-cleaned${extension}`;
}

function extensionForFormat(format: MetadataImageFormat) {
  switch (format) {
    case "jpeg":
      return "jpg";
    case "unknown":
      return "bin";
    default:
      return format;
  }
}

function getMimeType(file: File, format: MetadataImageFormat) {
  if (file.type) {
    return file.type;
  }

  switch (format) {
    case "png":
      return "image/png";
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "heif":
      return "image/heif";
    case "jxl":
      return "image/jxl";
    default:
      return "application/octet-stream";
  }
}

function concatUint8Arrays(parts: Uint8Array[]) {
  const totalLength = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function toArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function addWarning(warnings: string[], warning: string) {
  if (!warnings.includes(warning)) {
    warnings.push(warning);
  }
}

function markersContainC2pa(markers: string[]) {
  return markers.some((marker) => marker.toLowerCase().includes("c2pa"));
}

function hasBlockingCleanWarning(warnings: string[]) {
  return warnings.some((warning) =>
    /unsupported|scan-only|malformed|not box-walkable|incomplete|exceeds file length/i.test(
      warning,
    ),
  );
}

function isStandaloneJpegMarker(marker: number) {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

function startsWithAscii(bytes: Uint8Array, value: string) {
  return readAscii(bytes, 0, value.length) === value;
}

function containsByteSequence(haystack: Uint8Array, needle: Uint8Array) {
  if (needle.length === 0 || haystack.length < needle.length) {
    return false;
  }

  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    let matched = true;

    for (let needleIndex = 0; needleIndex < needle.length; needleIndex += 1) {
      if (haystack[index + needleIndex] !== needle[needleIndex]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return true;
    }
  }

  return false;
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  if (offset < 0 || offset + length > bytes.length) {
    return "";
  }

  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index]);
  }

  return value;
}

function asciiBytes(value: string) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index);
  }
  return bytes;
}

function writeUint32Le(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function readUint64(view: DataView, offset: number) {
  const high = view.getUint32(offset);
  const low = view.getUint32(offset + 4);
  const value = high * 2 ** 32 + low;

  if (!Number.isSafeInteger(value)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return value;
}

function toDataView(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function getLowerExtension(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
