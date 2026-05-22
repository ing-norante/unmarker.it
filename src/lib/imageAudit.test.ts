import { describe, expect, it } from "vitest";
import { buildImageAudit, createVerificationDiff } from "./imageAudit";
import type { GeminiDetectionResult, MetadataScanResult } from "./types";

describe("imageAudit", () => {
  it("marks visible watermark as not scanned for analysis-only files", () => {
    const audit = buildImageAudit({
      stage: "preflight",
      metadataScan: emptyScan(),
      visibleScanStatus: "not-scanned",
    });

    expect(audit.visibleWatermark.status).toBe("not-scanned");
    expect(audit.hiddenWatermark.status).toBe("at-risk");
  });

  it("marks hidden watermark postflight as neutralized but unverified", () => {
    const audit = buildImageAudit({
      stage: "postflight",
      metadataScan: emptyScan(),
      visibleDetection: notDetected(),
    });

    expect(audit.hiddenWatermark.status).toBe("neutralized-unverified");
  });

  it("creates a before and after diff with partial postflight warnings", () => {
    const preflight = buildImageAudit({
      stage: "preflight",
      metadataScan: scanWithSignals(2),
      visibleDetection: detected(),
    });
    const diff = createVerificationDiff(preflight, null, [
      "Postflight metadata scan failed.",
    ]);

    expect(diff).toMatchObject({
      metadataBeforeCount: 2,
      metadataAfterCount: null,
      visibleBefore: "detected",
      visibleAfter: null,
      hiddenAfter: "neutralized-unverified",
      warnings: ["Postflight metadata scan failed."],
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
      label: `Signal ${index + 1}`,
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
