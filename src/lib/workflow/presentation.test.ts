import { describe, expect, it } from "vitest";
import { buildImageAudit } from "@/lib/imageAudit";
import type { BatchItem, BatchSnapshot } from "@/lib/batch/queue";
import type {
  ImageAuditResult,
  MetadataScanResult,
  VisibleScanResult,
} from "@/lib/types";
import { DEFAULT_OPTIONS } from "@/lib/pipeline";
import {
  presentBatch,
  presentBatchItem,
  presentVerification,
  presentVisible,
} from "./presentation";

const scanned: VisibleScanResult = {
  status: "scanned",
  detection: {
    detected: false,
    confidence: 0.1,
    region: { x: 0, y: 0, width: 48, height: 48 },
    spatialScore: 0.1,
    gradientScore: 0.1,
    varianceScore: 0.1,
  },
};
const metadata: MetadataScanResult = {
  format: "jpeg",
  hasAiMetadata: false,
  signals: [],
  warnings: [],
};
const audit = (
  visibleScan: VisibleScanResult,
  metadataScan: MetadataScanResult | null = metadata,
) => buildImageAudit({ stage: "postflight", visibleScan, metadataScan });
const completed = (
  postflight: ImageAuditResult,
): Extract<BatchItem, { status: "completed-with-warnings" }> => ({
  id: "1",
  attempt: 0,
  file: new File(["image"], "image.png"),
  options: DEFAULT_OPTIONS,
  status: "completed-with-warnings",
  error: null,
  progress: null,
  outputName: "image.jpg",
  result: {
    outcome: "completed-with-warnings",
    output: new Blob(["jpeg"]),
    outputName: "image.jpg",
    preflight: audit(scanned),
    postflight,
    warnings: postflight.warnings,
    canCleanMetadata: true,
  },
});

describe("workflow presentation", () => {
  it.each(["failed", "not-scanned"] as const)(
    "never presents %s visible checks as complete",
    (status) => {
      const postflight = audit({ status });
      expect(presentVerification(postflight)).toEqual({
        visibleChecked: false,
        metadataChecked: true,
        checksComplete: false,
      });
      expect(presentVisible(postflight.visibleWatermark.status).checked).toBe(
        false,
      );
      expect(presentBatchItem(completed(postflight)).verificationFailed).toBe(
        false,
      );
    },
  );

  it("keeps output downloadable while exposing completely unavailable verification", () => {
    const postflight = audit({ status: "failed" }, null);
    const item = completed(postflight);
    const view = presentBatchItem(item);
    expect(view.output).toBe(item.result!.output);
    expect(view.phase).toBe("complete");
    expect(view.verificationFailed).toBe(true);
    expect(presentVerification(postflight).checksComplete).toBe(false);
  });

  it("requires complete metadata coverage as well as a visible scan", () => {
    const partial = audit(scanned, {
      ...metadata,
      warnings: [{ code: "metadata-scan-limit" }],
    });
    expect(presentVerification(partial).checksComplete).toBe(false);
    expect(presentVerification(audit(scanned)).checksComplete).toBe(true);
  });

  it("does not interpret residual visible evidence as a failed scan", () => {
    const marked = audit({
      status: "scanned",
      detection: { ...scanned.detection, detected: true },
    });
    expect(presentVisible(marked.visibleWatermark.status)).toMatchObject({
      tone: "danger",
      checked: true,
    });
    expect(presentVerification(marked).visibleChecked).toBe(true);
  });

  it("disables heavy actions and reset throughout the shared operation lease", () => {
    const snapshot: BatchSnapshot = {
      items: [completed(audit(scanned))],
      paused: true,
      activeId: null,
      notice: null,
      operationLocked: false,
    };
    expect(presentBatch(snapshot)).toMatchObject({
      canExport: true,
      canReset: true,
      canCleanMetadata: true,
      ready: 1,
    });
    expect(presentBatch({ ...snapshot, operationLocked: true })).toMatchObject({
      canExport: false,
      canReset: false,
      canCleanMetadata: false,
      ready: 1,
    });
    expect(presentBatch({ ...snapshot, activeId: "1" })).toMatchObject({
      canExport: false,
      canCleanMetadata: false,
    });
  });

  it("keeps analysis-only results retryable without inventing a processed preview", () => {
    const postflight = audit({ status: "not-scanned" });
    const item: BatchItem = {
      ...completed(postflight),
      status: "analysis-only",
      result: {
        outcome: "analysis-only",
        preflight: postflight,
        postflight: null,
        output: null,
        outputName: null,
        warnings: [],
        canCleanMetadata: true,
      },
    };
    expect(presentBatchItem(item)).toMatchObject({
      phase: "analysis-only",
      retryable: true,
      output: null,
      verificationFailed: false,
    });
  });
});
