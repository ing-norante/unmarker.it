import type { MetadataCleanResult, MetadataImageFormat } from "@/lib/types";

export function buildCleanResult(
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

export function originalCleanResult(
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

export function concatUint8Arrays(parts: Uint8Array[]) {
  const totalLength = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

export function toArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function addWarning(warnings: string[], warning: string) {
  if (!warnings.includes(warning)) {
    warnings.push(warning);
  }
}

export function startsWithAscii(bytes: Uint8Array, value: string) {
  return readAscii(bytes, 0, value.length) === value;
}

export function containsByteSequence(haystack: Uint8Array, needle: Uint8Array) {
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

export function bytesEqual(left: Uint8Array, right: Uint8Array) {
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

export function readAscii(bytes: Uint8Array, offset: number, length: number) {
  if (offset < 0 || offset + length > bytes.length) {
    return "";
  }

  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index]);
  }

  return value;
}

export function asciiBytes(value: string) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index);
  }
  return bytes;
}

export function writeUint32Le(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

export function readUint64(view: DataView, offset: number) {
  const high = view.getUint32(offset);
  const low = view.getUint32(offset + 4);
  const value = high * 2 ** 32 + low;

  if (!Number.isSafeInteger(value)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return value;
}

export function toDataView(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function getLowerExtension(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

export function unique<T>(values: T[]) {
  return [...new Set(values)];
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
