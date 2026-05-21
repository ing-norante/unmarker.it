export type PipelineStepId =
  | "gemini-detect"
  | "gemini-restore"
  | "shake"
  | "stir"
  | "crush";

export type PipelineStepStatus =
  | "idle"
  | "running"
  | "done"
  | "skipped"
  | "error";

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

export interface GeminiWatermarkRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GeminiDetectionResult {
  detected: boolean;
  confidence: number;
  region: GeminiWatermarkRegion;
  spatialScore: number;
  gradientScore: number;
  varianceScore: number;
}

export type GeminiWorkerProgressStage =
  | "loading-opencv"
  | "loading-alpha"
  | "detecting"
  | "restoring"
  | "inpainting"
  | "done"
  | "skipped"
  | "error";

export type GeminiWorkerRequest = {
  type: "process";
  jobId: number;
  imageData: ImageData;
};

export type GeminiWorkerResponse =
  | {
      type: "progress";
      jobId: number;
      stage: GeminiWorkerProgressStage;
    }
  | {
      type: "done";
      jobId: number;
      detection: GeminiDetectionResult;
      imageData: ImageData;
    }
  | {
      type: "skipped";
      jobId: number;
      detection: GeminiDetectionResult;
      imageData: ImageData;
    }
  | {
      type: "error";
      jobId: number;
      message: string;
    };
