import {
  trackAction,
  type AnalyticsProperties,
  type TrackingAction,
} from "@/lib/analytics";
import type { ImageProcessor } from "@/lib/batch/queue";
import {
  processImage,
  ImageEngineError,
  type ImageEnginePhase,
  type ImageEngineProgress,
} from "@/lib/engine";
import { assertNotAborted, isAbortError } from "@/lib/runtime/abort";
import { canCleanMetadata } from "@/lib/metadataCleaner";

/** Optional application adapter. The processing engine never initializes analytics. */
export function createTrackedImageProcessor(
  processor: ImageProcessor = processImage,
): ImageProcessor {
  const attempts = new WeakMap<File, number>();
  return async (file, options, controls) => {
    assertNotAborted(controls.signal);
    const attempt = (attempts.get(file) ?? 0) + 1;
    attempts.set(file, attempt);
    const base: AnalyticsProperties = {
      workflow_id: createWorkflowId(),
      workflow_mode: "batch",
      attempt,
      trigger: attempt === 1 ? "initial" : "retry",
    };
    const started = performance.now();
    let phase: ImageEnginePhase | null = null;
    let phaseStarted = started;
    const elapsed = (since: number) =>
      Math.max(0, Math.round(performance.now() - since));
    const capture = (
      action: TrackingAction,
      properties: AnalyticsProperties = {},
    ) => {
      try {
        // trackAction already enforces the current analytics consent, including revocation.
        trackAction(action, "workflow", { ...base, ...properties });
      } catch {
        // Optional telemetry must never cause a local image job to fail.
      }
    };
    const finishPreflight = (progress: ImageEngineProgress) => {
      capture("preflight_complete", {
        can_process: progress.phase !== "analysis-only",
        can_clean_metadata: canCleanMetadata(
          progress.preflight?.metadataScan ?? null,
        ),
        duration_ms: elapsed(phaseStarted),
      });
    };
    capture("workflow_started");
    if (attempt > 1) capture("process_image", { retry_stage: "preflight" });
    try {
      const result = await processor(file, options, {
        ...controls,
        onProgress: (progress) => {
          if (controls.signal?.aborted) return;
          if (progress.phase !== phase) {
            if (
              phase === "preflight-scanning" &&
              ["processing", "analysis-only"].includes(progress.phase)
            )
              finishPreflight(progress);
            if (
              phase === "processing" &&
              progress.phase === "postflight-scanning"
            )
              capture("processing_complete", {
                duration_ms: elapsed(phaseStarted),
              });
            if (progress.phase === "preflight-scanning")
              capture("preflight_started");
            if (progress.phase === "processing") capture("processing_started");
            // Completion comes with the return value; preserve the postflight timer.
            if (progress.phase !== "complete") phaseStarted = performance.now();
            phase = progress.phase;
          }
          controls.onProgress?.(progress);
        },
      });
      assertNotAborted(controls.signal);
      if (result.outcome === "analysis-only") {
        capture("analysis_only", { duration_ms: elapsed(started) });
        capture("workflow_completed", {
          duration_ms: elapsed(started),
          outcome: "analysis_only",
        });
      } else {
        const verificationFailed = !result.postflight;
        capture("postflight_complete", {
          duration_ms: elapsed(phaseStarted),
          outcome: verificationFailed
            ? "verification_failed"
            : result.postflight!.warnings.length
              ? "completed_with_warnings"
              : "completed",
        });
        capture("workflow_completed", {
          duration_ms: elapsed(started),
          outcome: verificationFailed
            ? "processed_with_verification_failure"
            : result.outcome === "completed"
              ? "processed"
              : "processed_with_warnings",
        });
      }
      return result;
    } catch (error) {
      if (isAbortError(error) || controls.signal?.aborted) {
        capture("workflow_cancelled", { phase: phase ?? "preflight-scanning" });
      } else {
        const invalid =
          error instanceof ImageEngineError && error.code === "invalid-file";
        const stage = invalid
          ? "validation"
          : phase === "processing"
            ? "processing"
            : phase === "postflight-scanning"
              ? "postflight"
              : "preflight";
        const reason =
          error instanceof ImageEngineError
            ? error.code.replaceAll("-", "_")
            : stage === "processing"
              ? "pipeline_failed"
              : `${stage}_failed`;
        if (invalid)
          capture("workflow_validation_failed", { reason_code: reason });
        capture("workflow_error", { stage, reason_code: reason });
      }
      throw error;
    }
  };
}

function createWorkflowId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Some older browser engines expose getRandomValues but not randomUUID.
  if (globalThis.crypto?.getRandomValues) {
    return Array.from(
      globalThis.crypto.getRandomValues(new Uint32Array(4)),
      (value) => value.toString(16).padStart(8, "0"),
    ).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
