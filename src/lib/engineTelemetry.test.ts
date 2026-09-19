import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageProcessor } from "@/lib/batch/queue";
import type { ImageEngineResult } from "@/lib/engine";
import { buildImageAudit } from "@/lib/imageAudit";

const capture = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", () => ({ trackAction: capture }));
import { createTrackedImageProcessor } from "./engineTelemetry";

const preflight = buildImageAudit({
  stage: "preflight",
  metadataScan: null,
  visibleScan: { status: "not-scanned" },
});
const postflight = buildImageAudit({
  stage: "postflight",
  metadataScan: null,
  visibleScan: { status: "not-scanned" },
});
const result: ImageEngineResult = {
  output: new Blob(["SECRET_PIXELS"]),
  outputName: "SECRET_OUTPUT.jpg",
  preflight,
  postflight,
  outcome: "completed",
  canCleanMetadata: false,
  warnings: [],
};
const file = () =>
  new File(["SECRET_INPUT"], "SECRET_FILE.png", { type: "image/png" });
const succeed: ImageProcessor = async (_file, _options, controls) => {
  for (const phase of [
    "preflight-scanning",
    "preflight-scanning",
    "processing",
    "processing",
    "postflight-scanning",
    "complete",
  ] as const) {
    controls.onProgress?.({ phase, steps: [], preflight });
  }
  return result;
};
const actions = () => capture.mock.calls.map(([action]) => action);

describe("engine application telemetry adapter", () => {
  beforeEach(() => {
    capture.mockReset();
  });

  it("keeps the legacy lifecycle without duplicate events from progress updates", async () => {
    const progress = vi.fn();
    const tracked = createTrackedImageProcessor(succeed);
    await expect(tracked(file(), {}, { onProgress: progress })).resolves.toBe(
      result,
    );
    expect(actions()).toEqual([
      "workflow_started",
      "preflight_started",
      "preflight_complete",
      "processing_started",
      "processing_complete",
      "postflight_complete",
      "workflow_completed",
    ]);
    expect(progress).toHaveBeenCalledTimes(6);
    expect(capture.mock.calls.at(-1)?.[2]).toMatchObject({
      workflow_mode: "batch",
      attempt: 1,
      trigger: "initial",
      outcome: "processed",
    });
    expect(
      new Set(
        capture.mock.calls.map(([, , properties]) => properties.workflow_id),
      ).size,
    ).toBe(1);
    expect(JSON.stringify(capture.mock.calls)).not.toContain("SECRET");
  });

  it("assigns a fresh opaque workflow id to retries without retaining file contents", async () => {
    const tracked = createTrackedImageProcessor(succeed);
    const original = file();
    await tracked(original, {}, {});
    await tracked(original, {}, {});
    const starts = capture.mock.calls.filter(
      ([action]) => action === "workflow_started",
    );
    expect(starts[0][2].workflow_id).not.toBe(starts[1][2].workflow_id);
    expect(starts[1][2]).toMatchObject({ attempt: 2, trigger: "retry" });
    expect(
      actions().filter((action) => action === "process_image"),
    ).toHaveLength(1);
  });

  it("preserves analysis-only outcomes without reporting processing success", async () => {
    const tracked = createTrackedImageProcessor(
      async (_file, _options, controls) => {
        controls.onProgress?.({ phase: "preflight-scanning", steps: [] });
        controls.onProgress?.({ phase: "analysis-only", steps: [], preflight });
        return {
          ...result,
          output: null,
          outputName: null,
          postflight: null,
          outcome: "analysis-only",
        };
      },
    );
    await tracked(file(), {}, {});
    expect(actions()).toEqual([
      "workflow_started",
      "preflight_started",
      "preflight_complete",
      "analysis_only",
      "workflow_completed",
    ]);
    expect(capture.mock.calls.at(-1)?.[2].outcome).toBe("analysis_only");
  });

  it("reports cancellation once and never records completion", async () => {
    const controller = new AbortController();
    const tracked = createTrackedImageProcessor(
      async (_file, _options, controls) => {
        controls.onProgress?.({ phase: "preflight-scanning", steps: [] });
        controller.abort();
        throw new DOMException("Cancelled", "AbortError");
      },
    );
    await expect(
      tracked(file(), {}, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(actions()).toEqual([
      "workflow_started",
      "preflight_started",
      "workflow_cancelled",
    ]);
  });

  it("records only a bounded failure reason, never raw error messages", async () => {
    const tracked = createTrackedImageProcessor(
      async (_file, _options, controls) => {
        controls.onProgress?.({ phase: "processing", steps: [] });
        throw new Error(
          "Could not decode SECRET_FILE.png with SECRET_METADATA",
        );
      },
    );
    await expect(tracked(file(), {}, {})).rejects.toThrow("SECRET");
    expect(capture.mock.calls.at(-1)?.[2]).toMatchObject({
      stage: "processing",
      reason_code: "pipeline_failed",
    });
    expect(JSON.stringify(capture.mock.calls)).not.toContain("SECRET");
    expect(actions()).not.toContain("workflow_completed");
  });

  it("keeps processing available when the optional consent-gated telemetry helper fails", async () => {
    capture.mockImplementation(() => {
      throw new Error("Analytics unavailable");
    });
    await expect(
      createTrackedImageProcessor(succeed)(file(), {}, {}),
    ).resolves.toBe(result);
  });
});
