import { withObjectUrl } from "./objectUrl";
import type { AppMode, StatusMessage } from "./types";

export const MAX_FILE_SIZE_MB = 25;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const MAX_MEGAPIXELS = 40;

const METADATA_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "avif",
  "heic",
  "heif",
  "jxl",
]);

const METADATA_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heic-sequence",
  "image/heif",
  "image/heif-sequence",
  "image/jxl",
]);

const METADATA_ACCEPT_VALUES = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".heic",
  ".heif",
  ".jxl",
  ...METADATA_MIME_TYPES,
];

type FileValidationResult =
  | { ok: true }
  | { ok: false; statusMessage: StatusMessage };

type FileValidator = (
  file: File,
) => FileValidationResult | Promise<FileValidationResult>;

export interface FileModePolicy {
  accept: string;
  supportedCopy: string;
  limitCopy: string[];
  validate: FileValidator;
}

export const FILE_MODE_POLICIES: Record<AppMode, FileModePolicy> = {
  unmark: {
    accept: "image/*",
    supportedCopy: "Supports browser-readable image files",
    limitCopy: [
      `Max resolution: ${MAX_MEGAPIXELS} MPixels`,
      `Max file size: ${MAX_FILE_SIZE_MB} MB`,
    ],
    validate: validateUnmarkFile,
  },
  metadata: {
    accept: METADATA_ACCEPT_VALUES.join(","),
    supportedCopy: "Supports PNG, JPEG, WebP, AVIF, HEIF, JXL",
    limitCopy: [`Max file size: ${MAX_FILE_SIZE_MB} MB`],
    validate: validateMetadataFile,
  },
};

export function getFileModePolicy(mode: AppMode) {
  return FILE_MODE_POLICIES[mode];
}

export async function validateFileForMode(mode: AppMode, file: File) {
  return await getFileModePolicy(mode).validate(file);
}

export async function validateUnmarkFile(
  file: File,
): Promise<FileValidationResult> {
  if (!file.type.startsWith("image/")) {
    return invalidFile(
      "Unsupported file type",
      "Please select a valid image file.",
    );
  }

  const sizeValidation = validateFileSize(file);
  if (!sizeValidation.ok) {
    return sizeValidation;
  }

  let dimensions: { width: number; height: number };
  try {
    dimensions = await loadImageDimensions(file);
  } catch {
    return invalidFile(
      "Could not read image",
      "This file could not be decoded. Try another image and retry.",
    );
  }

  const megapixels = (dimensions.width * dimensions.height) / 1_000_000;
  if (megapixels > MAX_MEGAPIXELS) {
    return invalidFile(
      "Image resolution is too high",
      `Please use an image up to ${MAX_MEGAPIXELS} megapixels.`,
    );
  }

  return { ok: true };
}

export function validateMetadataFile(file: File): FileValidationResult {
  if (!isMetadataFileCandidate(file)) {
    return invalidFile(
      "Unsupported file type",
      "Please select a PNG, JPEG, WebP, AVIF, HEIF, or JXL image file.",
    );
  }

  return validateFileSize(file);
}

export function isMetadataFileCandidate(file: File) {
  if (METADATA_MIME_TYPES.has(file.type.toLowerCase())) {
    return true;
  }

  const dot = file.name.lastIndexOf(".");
  if (dot < 0) {
    return false;
  }

  return METADATA_EXTENSIONS.has(file.name.slice(dot + 1).toLowerCase());
}

function validateFileSize(file: File): FileValidationResult {
  if (file.size <= MAX_FILE_SIZE_BYTES) {
    return { ok: true };
  }

  return invalidFile(
    "File is too large",
    `Please use an image up to ${MAX_FILE_SIZE_MB} MB.`,
  );
}

function invalidFile(
  title: StatusMessage["title"],
  description: StatusMessage["description"],
): FileValidationResult {
  return {
    ok: false,
    statusMessage: {
      variant: "destructive",
      title,
      description,
    },
  };
}

async function loadImageDimensions(file: File) {
  const img = new Image();

  return await withObjectUrl(file, async (objectUrl) => {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to decode image"));
      img.src = objectUrl;
    });

    return { width: img.width, height: img.height };
  });
}
