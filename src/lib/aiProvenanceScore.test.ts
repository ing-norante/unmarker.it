import { describe, expect, it } from "vitest";
import { inferAiProvenanceScore } from "./aiProvenanceScore";
import type { MetadataScanResult } from "./types";

describe("aiProvenanceScore", () => {
  it("uses the strongest band for C2PA provenance", () => {
    const score = inferAiProvenanceScore(
      scanWithSignal("c2pa", "C2PA manifest", "c2pa openai"),
      null,
    );

    expect(score.percentage).toBe(98);
    expect(score.provider).toBe("OpenAI");
    expect(score.confidence).toBe("high");
  });

  it("maps provider metadata markers to the medium band", () => {
    const score = inferAiProvenanceScore(
      scanWithSignal("png-text", "PNG text AI marker", "midjourney prompt"),
      null,
    );

    expect(score.percentage).toBe(88);
    expect(score.provider).toBe("Midjourney");
    expect(score.confidence).toBe("medium");
  });

  it("uses Gemini confidence when only a visible watermark was found", () => {
    const score = inferAiProvenanceScore(emptyScan(), {
      detected: true,
      confidence: 0.97,
      region: { x: 0, y: 0, width: 48, height: 48 },
      spatialScore: 1,
      gradientScore: 1,
      varianceScore: 1,
    });

    expect(score.percentage).toBe(94);
    expect(score.provider).toBe("Google/Gemini");
  });

  it("does not claim human provenance when no local signals are found", () => {
    const score = inferAiProvenanceScore(emptyScan(), null);

    expect(score.percentage).toBe(12);
    expect(score.label).toBe("No local AI signals found");
    expect(score.provider).toBeNull();
  });
});

function scanWithSignal(
  type: MetadataScanResult["signals"][number]["type"],
  label: string,
  marker: string,
): MetadataScanResult {
  return {
    hasAiMetadata: true,
    format: "png",
    signals: [
      {
        type,
        label,
        location: "test",
        marker,
        removable: true,
      },
    ],
    warnings: [],
  };
}

function emptyScan(): MetadataScanResult {
  return {
    hasAiMetadata: false,
    format: "jpeg",
    signals: [],
    warnings: [],
  };
}
