import { describe, expect, it } from "vitest";
import { buildImageAudit, createVerificationDiff } from "./imageAudit";
import type { GeminiDetectionResult, MetadataScanResult } from "./types";
import { message } from "@/i18n/messages";

describe("imageAudit", () => {
  it("rejects a claimed completed visible scan without a detection", () => {
    expect(() => buildImageAudit({ stage: "preflight", metadataScan: emptyScan(), visibleScan: { status: "scanned", detection: null } as never }))
      .toThrow("requires its detection result");
  });

  it("keeps the report-v1 audit fields while narrowing unsupported internal states", () => {
    const audit = buildImageAudit({ stage: "postflight", metadataScan: emptyScan(), visibleScan: { status: "scanned", detection: notDetected() } });
    const report = JSON.parse(JSON.stringify(audit));
    expect(report.hiddenWatermark).toEqual({ status: "unverified" });
    expect(report.aiScore).toEqual({ percentage: null, kind: "none", provider: null, evidence: [message("workflow:audit.score.evidenceNone")], confidence: "low" });
    expect(report.visibleWatermark).toEqual({ status: "not-detected", detection: notDetected(), confidence: 0.1 });
  });

  it("marks visible watermark as not scanned for analysis-only files", () => {
    const audit = buildImageAudit({
      stage: "preflight",
      metadataScan: emptyScan(),
      visibleScan: { status: "not-scanned" },
    });

    expect(audit.visibleWatermark.status).toBe("not-scanned");
    expect(audit.aiScore).toMatchObject({ kind: "incomplete", percentage: null });
    expect(audit.hiddenWatermark.status).toBe("unverified");
  });

  it("does not claim hidden watermark neutralization from completion alone", () => {
    const audit = buildImageAudit({
      stage: "postflight",
      metadataScan: emptyScan(),
      visibleScan: { status: "scanned", detection: notDetected() },
    });

    expect(audit.hiddenWatermark.status).toBe("unverified");
  });

  it("creates a before and after diff with partial postflight warnings", () => {
    const preflight = buildImageAudit({
      stage: "preflight",
      metadataScan: scanWithSignals(2),
      visibleScan: { status: "scanned", detection: detected() },
    });
    const diff = createVerificationDiff(preflight, null, [
      message("workflow:warnings.postflightMetadata"),
    ]);

    expect(diff).toMatchObject({
      metadataBeforeCount: 2,
      metadataAfterCount: null,
      visibleBefore: "detected",
      visibleAfter: null,
      hiddenAfter: "unverified",
      warnings: [message("workflow:warnings.postflightMetadata")],
    });
  });
});

function emptyScan(): MetadataScanResult {
  return scanWithSignals(0);
}

function scanWithSignals(count: number): MetadataScanResult {
  return {
    hasAiMetadata: count > 0,
    format: "jpeg",
    signals: Array.from({ length: count }, (_, index) => ({
      type: "xmp" as const,
      label: message("metadata:signals.xmp", { index: index + 1 }),
      location: "test",
      marker: "openai",
      removable: true,
    })),
    warnings: [],
  };
}

function detected(): GeminiDetectionResult {
  return {
    detected: true,
    confidence: 0.8,
    region: { x: 0, y: 0, width: 48, height: 48 },
    spatialScore: 0.8,
    gradientScore: 0.8,
    varianceScore: 0.8,
  };
}

function notDetected(): GeminiDetectionResult {
  return {
    ...detected(),
    detected: false,
    confidence: 0.1,
  };
}
