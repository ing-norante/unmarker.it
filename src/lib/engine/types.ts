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

export interface ImageEngineResult {
  output: Blob | null;
  outputName: string | null;
  preflight: ImageAuditResult;
  postflight: ImageAuditResult | null;
  outcome: "completed" | "completed-with-warnings" | "analysis-only";
  warnings: MessageDescriptor[];
  canCleanMetadata: boolean;
}

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
