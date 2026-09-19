import type { MessageDescriptor } from "@/i18n/messages";
import type { ImageAuditResult, PipelineStepState } from "@/lib/types";

export type ImageEnginePhase =
  | "preflight-scanning"
  | "processing"
  | "postflight-scanning"
  | "complete"
  | "analysis-only";

export interface ImageEngineProgress {
  phase: ImageEnginePhase;
  steps: PipelineStepState[];
  preflight?: ImageAuditResult;
}

export interface ImageEngineControls {
  signal?: AbortSignal;
  onProgress?: (progress: ImageEngineProgress) => void;
}

interface ImageEngineResultBase {
  preflight: ImageAuditResult;
  warnings: MessageDescriptor[];
  canCleanMetadata: boolean;
}

export type ImageEngineProcessedResult = ImageEngineResultBase & {
  output: Blob;
  outputName: string;
  postflight: ImageAuditResult;
} & ({ outcome: "completed" } | { outcome: "completed-with-warnings" });

export type ImageEngineAnalysisResult = ImageEngineResultBase & {
  outcome: "analysis-only";
  output: null;
  outputName: null;
  postflight: null;
};

export type ImageEngineResult =
  ImageEngineProcessedResult | ImageEngineAnalysisResult;

export class ImageEngineError extends Error {
  readonly code: "invalid-file" | "decode-failed" | "processing-failed";
  readonly descriptor: MessageDescriptor;

  constructor(code: ImageEngineError["code"], descriptor: MessageDescriptor) {
    super(code);
    this.name = "ImageEngineError";
    this.code = code;
    this.descriptor = descriptor;
  }
}
