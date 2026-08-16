import type {
  GeminiWorkerProgressStage,
  PipelineStepId,
  PipelineStepState,
} from "./types";

export const PIPELINE_STEPS: PipelineStepState[] = [
  {
    id: "gemini-detect",
    status: "idle",
    progress: 0,
  },
  {
    id: "gemini-restore",
    status: "idle",
    progress: 0,
  },
  {
    id: "shake",
    status: "idle",
    progress: 0,
  },
  {
    id: "stir",
    status: "idle",
    progress: 0,
  },
  {
    id: "crush",
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
      ? { ...step, status: "idle" as const, progress: 0, errorCode: undefined }
      : step,
  );
}

export function markRunningPipelineStepsAsError(steps: PipelineStepState[]) {
  return steps.map((step) =>
    step.status === "running"
      ? { ...step, status: "error" as const, errorCode: "pipeline-failed" as const }
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
  return { ...step, status: "idle", progress: 0, errorCode: undefined };
}
