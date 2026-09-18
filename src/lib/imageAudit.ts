import { inferAiProvenanceScore } from "@/lib/aiProvenanceScore";
import type { MessageDescriptor } from "@/i18n/messages";
import type {
  GeminiDetectionResult,
  HiddenWatermarkAudit,
  ImageAuditResult,
  ImageAuditStage,
  ImageVerificationDiff,
  MetadataScanResult,
  VisibleWatermarkAudit,
} from "@/lib/types";

type BuildImageAuditOptions = {
  stage: ImageAuditStage;
  metadataScan: MetadataScanResult | null;
  visibleDetection?: GeminiDetectionResult | null;
  visibleScanStatus?: "scanned" | "not-scanned" | "failed";
  warnings?: MessageDescriptor[];
};

export function buildImageAudit({
  stage,
  metadataScan,
  visibleDetection = null,
  visibleScanStatus = "scanned",
  warnings = [],
}: BuildImageAuditOptions): ImageAuditResult {
  const visibleWatermark = createVisibleWatermarkAudit(
    visibleDetection,
    visibleScanStatus,
  );

  return {
    stage,
    metadataScan,
    visibleWatermark,
    hiddenWatermark: createHiddenWatermarkAudit(),
    aiScore: inferAiProvenanceScore(metadataScan, visibleDetection, visibleWatermark.status),
    warnings,
  };
}

export function createVerificationDiff(
  preflightAudit: ImageAuditResult | null,
  postflightAudit: ImageAuditResult | null,
  warnings: MessageDescriptor[] = [],
): ImageVerificationDiff | null {
  if (!preflightAudit) {
    return null;
  }

  return {
    metadataBeforeCount: preflightAudit.metadataScan?.signals.length ?? null,
    metadataAfterCount: postflightAudit?.metadataScan?.signals.length ?? null,
    visibleBefore: preflightAudit.visibleWatermark.status,
    visibleAfter: postflightAudit?.visibleWatermark.status ?? null,
    hiddenAfter:
      postflightAudit?.hiddenWatermark.status ?? "unverified",
    warnings,
  };
}

function createVisibleWatermarkAudit(
  detection: GeminiDetectionResult | null,
  scanStatus: "scanned" | "not-scanned" | "failed",
): VisibleWatermarkAudit {
  if (scanStatus === "not-scanned") {
    return {
      status: "not-scanned",
      detection: null,
      confidence: null,
    };
  }

  if (scanStatus === "failed") {
    return {
      status: "scan-failed",
      detection: null,
      confidence: null,
    };
  }

  if (detection?.detected) {
    return {
      status: "detected",
      detection,
      confidence: detection.confidence,
    };
  }

  return {
    status: "not-detected",
    detection,
    confidence: detection?.confidence ?? 0,
  };
}

function createHiddenWatermarkAudit(): HiddenWatermarkAudit {
  // Pixel processing cannot establish presence or successful removal without a detector.
  return { status: "unverified" };
}
