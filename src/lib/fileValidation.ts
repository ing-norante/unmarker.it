import { message, type MessageDescriptor } from "@/i18n/messages";
import type { StatusMessage } from "./types";

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

export const WORKFLOW_ACCEPT = ["image/*", ...METADATA_ACCEPT_VALUES].join(",");

type FileValidationResult =
  | { ok: true }
  | { ok: false; statusMessage: StatusMessage };

type FileValidator = (
  file: File,
) => FileValidationResult | Promise<FileValidationResult>;

export interface FileModePolicy {
  accept: string;
  supportedCopy: MessageDescriptor;
  limitCopy: MessageDescriptor[];
  validate: FileValidator;
}

export function getWorkflowFilePolicy(): FileModePolicy {
  return {
    accept: WORKFLOW_ACCEPT,
    supportedCopy: message("workflow:filePolicy.workflow"),
    limitCopy: [
      message("workflow:filePolicy.maxProcessingResolution", { count: MAX_MEGAPIXELS }),
      message("workflow:filePolicy.maxFileSize", { count: MAX_FILE_SIZE_MB }),
    ],
    validate: validateWorkflowFile,
  };
}

export function validateWorkflowFile(file: File): FileValidationResult {
  const sizeValidation = validateFileSize(file);
  if (!sizeValidation.ok) {
    return sizeValidation;
  }

  if (isWorkflowFileCandidate(file)) {
    return { ok: true };
  }

  return invalidFile(
    message("workflow:messages.unsupportedType.title"),
    message("workflow:messages.unsupportedType.description"),
  );
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

export function isWorkflowFileCandidate(file: File) {
  return (
    file.type.toLowerCase().startsWith("image/") ||
    isMetadataFileCandidate(file)
  );
}

function validateFileSize(file: File): FileValidationResult {
  if (file.size <= MAX_FILE_SIZE_BYTES) {
    return { ok: true };
  }

  return invalidFile(
    message("workflow:messages.fileLarge.title"),
    message("workflow:messages.fileLarge.description", { count: MAX_FILE_SIZE_MB }),
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
