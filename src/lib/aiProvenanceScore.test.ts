import { describe, expect, it } from "vitest";
import { inferAiProvenanceScore } from "./aiProvenanceScore";
import type { MetadataScanResult } from "./types";
import { message } from "@/i18n/messages";
import { interpretManifestStore } from "./c2pa/interpret";

describe("aiProvenanceScore", () => {
  it("does not treat C2PA presence or an embedded vendor name as AI evidence", () => {
    const score = inferAiProvenanceScore(
      scanWithSignal("c2pa", "C2PA manifest", "c2pa openai"),
      null,
    );

    expect(score.percentage).toBeNull();
    expect(score.kind).toBe("credentials");
    expect(score.provider).toBeNull();
  });

  it("maps provider metadata markers to the medium band", () => {
    const score = inferAiProvenanceScore(
      scanWithSignal("png-text", "PNG text AI marker", "midjourney prompt"),
      null,
    );

    expect(score.percentage).toBeNull();
    expect(score.provider).toBe("Midjourney");
    expect(score.confidence).toBe("medium");
  });

  it("keeps logo confidence separate from AI provenance probability", () => {
    const score = inferAiProvenanceScore(emptyScan(), {
      detected: true,
      confidence: 0.97,
      region: { x: 0, y: 0, width: 48, height: 48 },
      spatialScore: 1,
      gradientScore: 1,
      varianceScore: 1,
    });

    expect(score.percentage).toBeNull();
    expect(score.kind).toBe("visible");
    expect(score.provider).toBe("Google/Gemini");
  });

  it("does not claim human provenance when no local signals are found", () => {
    const score = inferAiProvenanceScore(emptyScan(), null, "not-detected");

    expect(score.percentage).toBeNull();
    expect(score.kind).toBe("none");
    expect(score.provider).toBeNull();
  });

  it.each(["not-scanned", "scan-failed"] as const)("does not score a %s visible check as negative", (status) => {
    const score = inferAiProvenanceScore(emptyScan(), null, status);
    expect(score).toMatchObject({ kind: "incomplete", percentage: null });
    expect(score.evidence).not.toContainEqual(message("workflow:audit.score.evidenceNone"));
  });

  it("does not score missing or partial metadata as a complete negative result", () => {
    for (const scan of [null, { ...emptyScan(), warnings: [{ code: "unsupported-scan" as const }] }]) {
      expect(inferAiProvenanceScore(scan, null, "not-detected"))
        .toMatchObject({ kind: "incomplete", percentage: null });
    }
  });

  it("retains positive evidence while disclosing missing checks", () => {
    const score = inferAiProvenanceScore(scanWithSignal("c2pa", "C2PA", "openai"), null, "scan-failed");
    expect(score.kind).toBe("credentials");
    expect(score.evidence).toContainEqual(message("workflow:audit.score.evidenceIncomplete"));
  });

  it.each(["photograph", "ai-generated", "composite"] as const)("uses explicit %s assertions rather than the credential container", (origin) => {
    const scan = scanWithSignal("c2pa", "C2PA", "c2pa");
    scan.c2pa = { presence: "present", origin, aiDisclosure: origin !== "photograph", integrity: "valid", verification: "local", trust: "unknown", reasons: ["trust-not-evaluated"] };
    const score = inferAiProvenanceScore(scan, null, "not-detected");
    expect(score).toMatchObject({ percentage: null, kind: origin === "photograph" ? "credentials" : "strong", provider: null });
  });

  it.each(["compositeCapture", "compositeSynthetic"])("keeps ordinary %s declarations out of the AI evidence category", (source) => {
    const scan = scanWithSignal("c2pa", "C2PA", "c2pa");
    scan.c2pa = interpretManifestStore({
      active_manifest: "current", validation_state: "Valid",
      manifests: { current: { assertions: [{ label: "c2pa.actions.v2", data: {
        actions: [{ action: "c2pa.created", digitalSourceType: `http://cv.iptc.org/newscodes/digitalsourcetype/${source}` }],
      } }] } },
    });
    expect(inferAiProvenanceScore(scan, null, "not-detected"))
      .toMatchObject({ percentage: null, kind: "credentials", provider: null });
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
        label: message("metadata:signals.binary", { label }),
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
