import type {
  GeminiWorkerProgressStage,
  PipelineStepId,
  PipelineStepState,
} from "./types";

export const PIPELINE_STEPS: PipelineStepState[] = [
  {
    id: "gemini-detect",
    label: "Gemini Scan",
    description:
      "We scan the bottom-right corner for the Gemini / Nano Banana sparkle logo using a local OpenCV.js worker.",
    status: "idle",
    progress: 0,
  },
  {
    id: "gemini-restore",
    label: "Gemini Restore",
    description:
      "When detected, we reverse the logo alpha blend and repair residual sparkle edges with local inpainting.",
    status: "idle",
    progress: 0,
  },
  {
    id: "shake",
    label: "Shake (Geometry)",
    description:
      "We apply a tiny random rotation (±0.5°) and a subtle zoom-in. This breaks the pixel grid alignment many invisible watermarks depend on.",
    status: "idle",
    progress: 0,
  },
  {
    id: "stir",
    label: "Stir (Noise)",
    description:
      "We inject low-amplitude RGB noise across the image to disturb the statistical patterns used by watermark detectors.",
    status: "idle",
    progress: 0,
  },
  {
    id: "crush",
    label: "Crush (Quantization)",
    description:
      "We recompress the image as JPEG to crush remaining high-frequency watermark signals.",
    status: "idle",
    progress: 0,
  },
];

export function createInitialPipelineSteps() {
  return PIPELINE_STEPS.map(resetPipelineStep);
}

export function resetRunningPipelineSteps(steps: PipelineStepState[]) {
  return steps.map((step) =>
    step.status === "running"
      ? { ...step, status: "idle" as const, progress: 0, error: undefined }
      : step,
  );
}

export function markRunningPipelineStepsAsError(steps: PipelineStepState[]) {
  return steps.map((step) =>
    step.status === "running"
      ? { ...step, status: "error" as const, error: "Failed" }
      : step,
  );
}

export function updateGeminiProgress(
  stage: GeminiWorkerProgressStage,
  updateStep: (id: PipelineStepId, update: Partial<PipelineStepState>) => void,
) {
  switch (stage) {
    case "loading-opencv":
      updateStep("gemini-detect", { status: "running", progress: 20 });
      break;
    case "loading-alpha":
      updateStep("gemini-detect", { status: "running", progress: 35 });
      break;
    case "detecting":
      updateStep("gemini-detect", { status: "running", progress: 70 });
      break;
    case "restoring":
      updateStep("gemini-detect", { status: "done", progress: 100 });
      updateStep("gemini-restore", { status: "running", progress: 35 });
      break;
    case "inpainting":
      updateStep("gemini-restore", { status: "running", progress: 75 });
      break;
    case "skipped":
      updateStep("gemini-detect", { status: "done", progress: 100 });
      updateStep("gemini-restore", { status: "skipped", progress: 100 });
      break;
    case "done":
      updateStep("gemini-restore", { status: "done", progress: 100 });
      break;
    case "error":
      updateStep("gemini-restore", { status: "error", progress: 100 });
      break;
  }
}

function resetPipelineStep(step: PipelineStepState): PipelineStepState {
  return { ...step, status: "idle", progress: 0, error: undefined };
}
