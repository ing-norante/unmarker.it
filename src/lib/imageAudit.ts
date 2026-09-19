import { inferAiProvenanceScore } from "@/lib/aiProvenanceScore";
import type { MessageDescriptor } from "@/i18n/messages";
import type {
  HiddenWatermarkAudit,
  ImageAuditResult,
  ImageAuditStage,
  ImageVerificationDiff,
  MetadataScanResult,
  VisibleWatermarkAudit,
  VisibleScanResult,
} from "@/lib/types";

type BuildImageAuditOptions = {
  stage: ImageAuditStage;
  metadataScan: MetadataScanResult | null;
  visibleScan: VisibleScanResult;
  warnings?: MessageDescriptor[];
};

export function buildImageAudit({
  stage,
  metadataScan,
  visibleScan,
  warnings = [],
}: BuildImageAuditOptions): ImageAuditResult {
  const visibleWatermark = createVisibleWatermarkAudit(visibleScan);

  return {
    stage,
    metadataScan,
    visibleWatermark,
    hiddenWatermark: createHiddenWatermarkAudit(),
    aiScore: inferAiProvenanceScore(metadataScan, visibleWatermark.detection, visibleWatermark.status),
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
  scan: VisibleScanResult,
): VisibleWatermarkAudit {
  if (scan.status === "not-scanned") {
    return {
      status: "not-scanned",
      detection: null,
      confidence: null,
    };
  }

  if (scan.status === "failed") {
    return {
      status: "scan-failed",
      detection: null,
      confidence: null,
    };
  }

  if (scan.status !== "scanned") throw new TypeError("Visible scan status is required");
  const { detection } = scan;
  if (!detection) throw new TypeError("A completed visible scan requires its detection result");
  if (detection.detected) {
    return {
      status: "detected",
      detection,
      confidence: detection.confidence,
    };
  }

  return {
    status: "not-detected",
    detection,
    confidence: detection.confidence,
  };
}

function createHiddenWatermarkAudit(): HiddenWatermarkAudit {
  // Pixel processing cannot establish presence or successful removal without a detector.
  return { status: "unverified" };
}
