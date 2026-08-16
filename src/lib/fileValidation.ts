import { withObjectUrl } from "./objectUrl";
import { message, type MessageDescriptor } from "@/i18n/messages";
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

export interface WorkflowImageDecodeResult {
  canDecode: boolean;
  width: number | null;
  height: number | null;
  megapixels: number | null;
  reason?: "decode-failed" | "too-large";
  statusMessage?: StatusMessage;
}

export const FILE_MODE_POLICIES: Record<AppMode, FileModePolicy> = {
  unmark: {
    accept: "image/*",
    supportedCopy: message("workflow:filePolicy.browser"),
    limitCopy: [
      message("workflow:filePolicy.maxResolution", { count: MAX_MEGAPIXELS }),
      message("workflow:filePolicy.maxFileSize", { count: MAX_FILE_SIZE_MB }),
    ],
    validate: validateUnmarkFile,
  },
  metadata: {
    accept: METADATA_ACCEPT_VALUES.join(","),
    supportedCopy: message("workflow:filePolicy.metadata"),
    limitCopy: [message("workflow:filePolicy.maxFileSize", { count: MAX_FILE_SIZE_MB })],
    validate: validateMetadataFile,
  },
};

export function getFileModePolicy(mode: AppMode) {
  return FILE_MODE_POLICIES[mode];
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

export async function validateFileForMode(mode: AppMode, file: File) {
  return await getFileModePolicy(mode).validate(file);
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

export async function validateUnmarkFile(
  file: File,
): Promise<FileValidationResult> {
  if (!file.type.startsWith("image/")) {
    return invalidFile(
      message("workflow:messages.invalidImageType.title"),
      message("workflow:messages.invalidImageType.description"),
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
      message("workflow:messages.unreadableImage.title"),
      message("workflow:messages.unreadableImage.description"),
    );
  }

  const megapixels = (dimensions.width * dimensions.height) / 1_000_000;
  if (megapixels > MAX_MEGAPIXELS) {
    return invalidFile(
      message("workflow:messages.resolutionHigh.title"),
      message("workflow:messages.resolutionHigh.description", { count: MAX_MEGAPIXELS }),
    );
  }

  return { ok: true };
}

export function validateMetadataFile(file: File): FileValidationResult {
  if (!isMetadataFileCandidate(file)) {
    return invalidFile(
    message("workflow:messages.invalidMetadataType.title"),
    message("workflow:messages.invalidMetadataType.description"),
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

export function isWorkflowFileCandidate(file: File) {
  return (
    file.type.toLowerCase().startsWith("image/") ||
    isMetadataFileCandidate(file)
  );
}

export async function inspectBrowserImageDecode(
  file: File,
): Promise<WorkflowImageDecodeResult> {
  try {
    const dimensions = await loadImageDimensions(file);
    const megapixels = (dimensions.width * dimensions.height) / 1_000_000;

    if (megapixels > MAX_MEGAPIXELS) {
      return {
        canDecode: false,
        width: dimensions.width,
        height: dimensions.height,
        megapixels,
        reason: "too-large",
        statusMessage: {
          variant: "destructive",
          title: message("workflow:messages.resolutionHighProcessing.title"),
          description: message("workflow:messages.resolutionHighProcessing.description", { count: MAX_MEGAPIXELS }),
        },
      };
    }

    return {
      canDecode: true,
      width: dimensions.width,
      height: dimensions.height,
      megapixels,
    };
  } catch {
    return {
      canDecode: false,
      width: null,
      height: null,
      megapixels: null,
      reason: "decode-failed",
    };
  }
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

export async function loadImageDimensions(file: File) {
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
