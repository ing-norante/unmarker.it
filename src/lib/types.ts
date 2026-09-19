import type { MessageDescriptor, MessageValues } from "@/i18n/messages";

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
  title: MessageDescriptor;
  description: MessageDescriptor;
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
  status: PipelineStepStatus;
  progress: number; // 0–100
  errorCode?: "pipeline-failed";
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

export type MetadataWarningCode =
  | "unsupported-clean"
  | "unsupported-scan"
  | "metadata-scan-limit"
  | "malformed-webp-header"
  | "webp-size-exceeds-file"
  | "malformed-webp-table"
  | "malformed-webp-chunk"
  | "malformed-jpeg-signature"
  | "malformed-jpeg-marker"
  | "malformed-jpeg-run"
  | "malformed-jpeg-length"
  | "malformed-jpeg-size"
  | "malformed-jpeg-payload"
  | "malformed-png-signature"
  | "malformed-png-table"
  | "malformed-png-length"
  | "missing-png-end"
  | "png-compressed-scan-only"
  | "png-decode-partial"
  | "png-text-limit"
  | "display-metadata-preserved"
  | "box-item-coverage"
  | "incomplete-box-table"
  | "incomplete-extended-box"
  | "malformed-box-length"
  | "jxl-codestream-scan-only"
  | "container-not-walkable";

export interface MetadataWarning {
  code: MetadataWarningCode;
  values?: MessageValues;
}

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
  label: MessageDescriptor;
  location: string;
  marker?: string;
  /** Complete evidence from this segment; marker remains the report-v1/UI projection. */
  markers?: string[];
  removable: boolean;
}

export interface MetadataScanResult {
  hasAiMetadata: boolean;
  format: MetadataImageFormat;
  signals: MetadataSignal[];
  warnings: MetadataWarning[];
  c2pa?: C2paAudit;
}

export interface C2paAudit {
  presence: "present" | "referenced" | "not-found";
  origin: "photograph" | "ai-generated" | "composite" | "unknown";
  /** Composite capture or conventional synthetic media alone does not declare AI. */
  aiDisclosure?: boolean;
  integrity: "valid" | "invalid" | "unknown";
  verification: "local" | "incomplete" | "failed";
  /** No trust list or network certificate lookup is used by this local reader. */
  trust: "unknown";
  reasons: Array<"remote-disabled" | "trust-not-evaluated" | "invalid-manifest" | "reader-unavailable" | "read-failed" | "timeout">;
}

export interface MetadataCleanResult {
  blob: Blob;
  fileName: string;
  format: MetadataImageFormat;
  removedCount: number;
  warnings: MetadataWarning[];
}

export type ImageAuditStage = "preflight" | "postflight";

export type VisibleWatermarkStatus =
  | "not-scanned"
  | "detected"
  | "not-detected"
  | "scan-failed";

export type VisibleWatermarkAudit =
  | { status: "detected" | "not-detected"; detection: GeminiDetectionResult; confidence: number }
  | { status: "not-scanned" | "scan-failed"; detection: null; confidence: null };

export type VisibleScanResult =
  | { status: "scanned"; detection: GeminiDetectionResult }
  | { status: "not-scanned" | "failed" };

export type HiddenWatermarkStatus = "unverified";

export interface HiddenWatermarkAudit {
  status: HiddenWatermarkStatus;
}

export interface AiProvenanceScore {
  percentage: null;
  kind: "strong" | "metadata" | "visible" | "credentials" | "none" | "incomplete";
  provider: string | null;
  evidence: MessageDescriptor[];
  confidence: "medium" | "low";
}

export interface ImageAuditResult {
  stage: ImageAuditStage;
  metadataScan: MetadataScanResult | null;
  visibleWatermark: VisibleWatermarkAudit;
  hiddenWatermark: HiddenWatermarkAudit;
  aiScore: AiProvenanceScore;
  warnings: MessageDescriptor[];
}

export interface ImageVerificationDiff {
  metadataBeforeCount: number | null;
  metadataAfterCount: number | null;
  visibleBefore: VisibleWatermarkStatus;
  visibleAfter: VisibleWatermarkStatus | null;
  hiddenAfter: HiddenWatermarkStatus;
  warnings: MessageDescriptor[];
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
      errorCode: "gemini-worker-failed";
      debugMessage?: string;
    };
