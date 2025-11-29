export type PipelineStepId = "shake" | "stir" | "crush";

export type PipelineStepStatus = "idle" | "running" | "done" | "error";

export interface PipelineStepState {
  id: PipelineStepId;
  label: string;
  description?: string;
  status: PipelineStepStatus;
  progress: number; // 0–100
  error?: string;
}

export interface ProcessingOptions {
  shake?: {
    rotationRange: number; // degrees, e.g., 0.5
    scaleRange: [number, number]; // e.g., [1.01, 1.02]
  };
  stir?: {
    noiseAmplitude: number; // e.g., 5
  };
  crush?: {
    quality: number; // 0–1
  };
}
