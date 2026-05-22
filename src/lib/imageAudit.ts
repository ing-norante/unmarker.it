import { inferAiProvenanceScore } from "@/lib/aiProvenanceScore";
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
  warnings?: string[];
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
    hiddenWatermark: createHiddenWatermarkAudit(stage),
    aiScore: inferAiProvenanceScore(metadataScan, visibleDetection),
    warnings: [...(metadataScan?.warnings ?? []), ...warnings],
  };
}

export function createVerificationDiff(
  preflightAudit: ImageAuditResult | null,
  postflightAudit: ImageAuditResult | null,
  warnings: string[] = [],
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
      postflightAudit?.hiddenWatermark.status ?? "neutralized-unverified",
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
      label: "Not scanned",
      description:
        "Visible watermark detection needs browser-decoded pixels, so this file was metadata-only.",
    };
  }

  if (scanStatus === "failed") {
    return {
      status: "scan-failed",
      detection: null,
      confidence: null,
      label: "Scan incomplete",
      description:
        "The visible watermark check did not complete. Processing can still continue with the fallback detector.",
    };
  }

  if (detection?.detected) {
    return {
      status: "detected",
      detection,
      confidence: detection.confidence,
      label: "Gemini watermark detected",
      description:
        "A Gemini-style sparkle watermark was detected in the image pixels.",
    };
  }

  return {
    status: "not-detected",
    detection,
    confidence: detection?.confidence ?? 0,
    label: "No visible watermark detected",
    description:
      "The local visible watermark scan did not find a Gemini-style mark.",
  };
}

function createHiddenWatermarkAudit(
  stage: ImageAuditStage,
): HiddenWatermarkAudit {
  if (stage === "postflight") {
    return {
      status: "neutralized-unverified",
      label: "Neutralized, not independently verified",
      description:
        "The shake, stir, and crush stages were applied to disrupt hidden statistical watermarks. There is no universal local detector to prove removal.",
    };
  }

  return {
    status: "at-risk",
    label: "Possible hidden watermark risk",
    description:
      "Invisible AI watermark signals may exist even when no metadata marker is present.",
  };
}
