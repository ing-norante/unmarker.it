export type AppMode = "unmark" | "metadata";

export type WorkflowPhase =
  | "idle"
  | "preflight-scanning"
  | "analysis-only"
  | "processing"
  | "postflight-scanning"
  | "complete"
  | "error"
  | "cancelled";

export type StatusMessage = {
  variant: "default" | "destructive";
  title: string;
  description: string;
};

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

export type MetadataSignalType =
  | "c2pa"
  | "xmp"
  | "exif"
  | "png-text"
  | "webp-metadata"
  | "isobmff-box"
  | "binary-marker";

export type MetadataImageFormat =
  | "png"
  | "jpeg"
  | "webp"
  | "avif"
  | "heif"
  | "jxl"
  | "unknown";

export interface MetadataSignal {
  type: MetadataSignalType;
  label: string;
  location: string;
  marker?: string;
  removable: boolean;
}

export interface MetadataScanResult {
  hasAiMetadata: boolean;
  format: MetadataImageFormat;
  signals: MetadataSignal[];
  warnings: string[];
}

export interface MetadataCleanResult {
  blob: Blob;
  fileName: string;
  format: MetadataImageFormat;
  removedCount: number;
  warnings: string[];
}

export type ImageAuditStage = "preflight" | "postflight";

export type VisibleWatermarkStatus =
  | "not-scanned"
  | "detected"
  | "not-detected"
  | "scan-failed";

export interface VisibleWatermarkAudit {
  status: VisibleWatermarkStatus;
  detection: GeminiDetectionResult | null;
  confidence: number | null;
  label: string;
  description: string;
}

export type HiddenWatermarkStatus =
  | "pending"
  | "at-risk"
  | "neutralized-unverified"
  | "unverified";

export interface HiddenWatermarkAudit {
  status: HiddenWatermarkStatus;
  label: string;
  description: string;
}

export interface AiProvenanceScore {
  percentage: number;
  label: string;
  provider: string | null;
  evidence: string[];
  confidence: "high" | "medium" | "low";
  description: string;
}

export interface ImageAuditResult {
  stage: ImageAuditStage;
  metadataScan: MetadataScanResult | null;
  visibleWatermark: VisibleWatermarkAudit;
  hiddenWatermark: HiddenWatermarkAudit;
  aiScore: AiProvenanceScore;
  warnings: string[];
}

export interface ImageVerificationDiff {
  metadataBeforeCount: number | null;
  metadataAfterCount: number | null;
  visibleBefore: VisibleWatermarkStatus;
  visibleAfter: VisibleWatermarkStatus | null;
  hiddenAfter: HiddenWatermarkStatus;
  warnings: string[];
}

export interface ImageWorkflowCapabilities {
  canProcess: boolean;
  canCleanMetadata: boolean;
}

export interface ImageWorkflowState {
  phase: WorkflowPhase;
  preflightAudit: ImageAuditResult | null;
  postflightAudit: ImageAuditResult | null;
  detectionHint: GeminiDetectionResult | null;
  processedBlob: Blob | null;
  processedImageUrl: string | null;
  processedFileName: string | null;
  capabilities: ImageWorkflowCapabilities;
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

export type GeminiWorkerRequest =
  | {
      type: "detect";
      jobId: number;
      imageData: ImageData;
    }
  | {
      type: "process";
      jobId: number;
      imageData: ImageData;
      detectionHint?: GeminiDetectionResult;
    };

export type GeminiWorkerResponse =
  | {
      type: "progress";
      jobId: number;
      stage: GeminiWorkerProgressStage;
    }
  | {
      type: "detected";
      jobId: number;
      detection: GeminiDetectionResult;
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
