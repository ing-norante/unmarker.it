import { message, messageId, type MessageDescriptor } from "@/i18n/messages";
import {
  isMetadataFileCandidate,
  MAX_MEGAPIXELS,
  validateWorkflowFile,
} from "@/lib/fileValidation";
import {
  detectGeminiOnCanvas,
  restoreGeminiOnCanvas,
} from "@/lib/geminiWorkerClient";
import { buildImageAudit } from "@/lib/imageAudit";
import { canCleanMetadata, scanImageMetadata } from "@/lib/metadataCleaner";
import { DEFAULT_OPTIONS } from "@/lib/pipeline";
import {
  createProcessingCanvas,
  getProcessingContext,
  releaseCanvas,
  type ProcessingCanvas,
} from "@/lib/canvas";
import {
  createInitialPipelineSteps,
  updateGeminiProgress,
} from "@/lib/pipelineSteps";
import type {
  VisibleScanResult,
  ImageAuditResult,
  MetadataScanResult,
  PipelineStepId,
  PipelineStepState,
  ProcessingOptions,
} from "@/lib/types";
import { generateCameraLikeFilename } from "@/lib/utils";
import { assertNotAborted, isAbortError } from "../runtime/abort";
import { decodeImage, ImageResolutionError, type DecodedImage } from "./canvas";
import { processPixels } from "./pixels";
import { geminiReadRegion, offsetDetection } from "./geminiRegion";
import {
  ImageEngineError,
  type ImageEngineControls,
  type ImageEnginePhase,
  type ImageEngineResult,
} from "./types";

/** Complete one local image job. No React, analytics, downloads or object URLs escape this boundary. */
export async function processImage(
  file: File,
  options: ProcessingOptions = DEFAULT_OPTIONS,
  controls: ImageEngineControls = {},
): Promise<ImageEngineResult> {
  const { signal, onProgress } = controls;
  assertNotAborted(signal);
  const validation = validateWorkflowFile(file);
  if (!validation.ok)
    throw new ImageEngineError(
      "invalid-file",
      validation.statusMessage.description,
    );
  // Snapshot options: later UI changes must not alter a running job.
  const processingOptions: ProcessingOptions = {
    shake: {
      ...DEFAULT_OPTIONS.shake!,
      ...options.shake,
      scaleRange: [
        ...(options.shake?.scaleRange ?? DEFAULT_OPTIONS.shake!.scaleRange),
      ],
    },
    stir: { ...DEFAULT_OPTIONS.stir!, ...options.stir },
    crush: { ...DEFAULT_OPTIONS.crush!, ...options.crush },
  };
  let phase: ImageEnginePhase = "preflight-scanning";
  let steps = createInitialPipelineSteps();
  let preflight: ImageAuditResult | undefined;
  const emit = () =>
    onProgress?.({
      phase,
      steps: steps.map((step) => ({ ...step })),
      preflight,
    });
  const updateStep = (
    id: PipelineStepId,
    update: Partial<PipelineStepState>,
  ) => {
    steps = steps.map((step) =>
      step.id === id ? { ...step, ...update } : step,
    );
    emit();
  };
  const warnings: MessageDescriptor[] = [];
  let canvas: ProcessingCanvas | null = null;
  let decoded: DecodedImage | null = null;
  emit();
  try {
    const metadataScan = await scanMetadata(
      file,
      "preflight",
      warnings,
      signal,
    );
    assertNotAborted(signal);
    try {
      decoded = await decodeImage(file, signal);
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (
        !(error instanceof ImageResolutionError) &&
        !isMetadataFileCandidate(file)
      ) {
        throw new ImageEngineError(
          "decode-failed",
          message("workflow:messages.decodeFailed.description"),
        );
      }
      warnings.push(
        error instanceof ImageResolutionError
          ? message("workflow:messages.resolutionHighProcessing.description", {
              count: MAX_MEGAPIXELS,
            })
          : message("workflow:warnings.pixelDecodeUnavailable"),
      );
    }
    let visibleScan: VisibleScanResult = { status: "not-scanned" };
    if (decoded) {
      canvas = createProcessingCanvas(decoded.width, decoded.height);
      const context = getProcessingContext(canvas);
      context.drawImage(decoded.source, 0, 0);
      decoded.release();
      decoded = null;
      updateStep("gemini-detect", { status: "running", progress: 10 });
      try {
        const detection = await detectGeminiOnCanvas(context, {
          signal,
          onProgress: (stage) => {
            if (stage !== "done") updateGeminiProgress(stage, updateStep);
          },
        });
        visibleScan = { status: "scanned", detection };
        updateStep("gemini-detect", { status: "done", progress: 100 });
      } catch (error) {
        if (isAbortError(error)) throw error;
        visibleScan = { status: "failed" };
        warnings.push(message("workflow:warnings.visibleScan"));
        updateStep("gemini-detect", {
          status: "error",
          progress: 100,
          errorCode: "pipeline-failed",
        });
      }
    }
    assertNotAborted(signal);
    preflight = buildImageAudit({
      stage: "preflight",
      metadataScan,
      visibleScan,
      warnings: [...warnings],
    });
    const canClean = canCleanMetadata(metadataScan);
    if (!canvas) {
      phase = "analysis-only";
      emit();
      return {
        output: null,
        outputName: null,
        preflight,
        postflight: null,
        outcome: "analysis-only",
        warnings,
        canCleanMetadata: canClean,
      };
    }
    phase = "processing";
    emit();
    // Reuse both positive and negative detections. Failure is explicitly reported,
    // but does not prevent independent pixel transforms and metadata cleaning.
    if (visibleScan.status === "scanned") {
      try {
        const result = await restoreGeminiOnCanvas(
          getProcessingContext(canvas),
          {
            signal,
            detectionHint: visibleScan.detection,
            onProgress: (stage) => updateGeminiProgress(stage, updateStep),
          },
        );
        updateStep("gemini-restore", {
          status: result.skipped ? "skipped" : "done",
          progress: 100,
        });
      } catch (error) {
        if (isAbortError(error)) throw error;
        warnings.push(message("workflow:warnings.visibleRestore"));
        updateStep("gemini-restore", {
          status: "error",
          progress: 100,
          errorCode: "pipeline-failed",
        });
      }
    } else {
      warnings.push(message("workflow:warnings.visibleRestore"));
      updateStep("gemini-restore", { status: "skipped", progress: 100 });
    }
    let currentPixelStep: PipelineStepId | null = null;
    const output = await processPixels(canvas, processingOptions, {
      signal,
      onFallback: () => {
        warnings.push(message("workflow:warnings.pixelWorkerFallback"));
        currentPixelStep = null;
        steps = steps.map((step) =>
          ["shake", "stir", "crush"].includes(step.id)
            ? { ...step, status: "idle", progress: 0 }
            : step,
        );
      },
      onPhase: (pixelPhase) => {
        if (currentPixelStep)
          updateStep(currentPixelStep, { status: "done", progress: 100 });
        currentPixelStep = pixelPhase;
        updateStep(pixelPhase, { status: "running", progress: 10 });
      },
    });
    assertNotAborted(signal);
    updateStep("crush", { status: "done", progress: 100 });
    releaseCanvas(canvas);
    canvas = null;
    phase = "postflight-scanning";
    emit();
    const outputName = generateCameraLikeFilename();
    const outputFile = new File([output], outputName, { type: output.type });
    const postflight = await auditOutput(outputFile, signal);
    warnings.push(...postflight.warnings);
    if (postflight.visibleWatermark.status === "detected")
      warnings.push(message("workflow:warnings.residualVisible"));
    if (postflight.metadataScan?.signals.length)
      warnings.push(message("workflow:warnings.residualMetadata"));
    assertNotAborted(signal);
    const uniqueWarnings = [
      ...new Map(
        warnings.map((warning) => [messageId(warning), warning]),
      ).values(),
    ];
    phase = "complete";
    emit();
    return {
      output,
      outputName,
      preflight,
      postflight,
      outcome: uniqueWarnings.length ? "completed-with-warnings" : "completed",
      warnings: uniqueWarnings,
      canCleanMetadata: canClean,
    };
  } finally {
    decoded?.release();
    if (canvas) releaseCanvas(canvas);
  }
}

async function scanMetadata(
  file: File,
  stage: "preflight" | "postflight",
  warnings: MessageDescriptor[],
  signal?: AbortSignal,
): Promise<MetadataScanResult | null> {
  try {
    const result = await scanImageMetadata(file, { signal });
    if (
      result.warnings.length ||
      (result.c2pa && result.c2pa.verification !== "local") ||
      result.c2pa?.integrity === "invalid"
    )
      warnings.push(message("workflow:warnings.metadataCoverage"));
    return result;
  } catch (error) {
    if (isAbortError(error)) throw error;
    warnings.push(
      message(
        stage === "preflight"
          ? "workflow:warnings.preflightMetadata"
          : "workflow:warnings.postflightMetadata",
      ),
    );
    return null;
  }
}

async function auditOutput(
  file: File,
  signal?: AbortSignal,
): Promise<ImageAuditResult> {
  const warnings: MessageDescriptor[] = [];
  const metadataScan = await scanMetadata(file, "postflight", warnings, signal);
  let visibleScan: VisibleScanResult = { status: "failed" };
  let decoded: DecodedImage | null = null;
  let canvas: ProcessingCanvas | null = null;
  try {
    decoded = await decodeImage(file, signal);
    const region = geminiReadRegion(decoded.width, decoded.height);
    canvas = createProcessingCanvas(region.width, region.height);
    const context = getProcessingContext(canvas);
    context.drawImage(
      decoded.source,
      region.x,
      region.y,
      region.width,
      region.height,
      0,
      0,
      region.width,
      region.height,
    );
    decoded.release();
    decoded = null;
    const detection = offsetDetection(
      await detectGeminiOnCanvas(context, { signal }),
      region.x,
      region.y,
    );
    visibleScan = { status: "scanned", detection };
  } catch (error) {
    if (isAbortError(error)) throw error;
    warnings.push(message("workflow:warnings.postflightVisible"));
  } finally {
    decoded?.release();
    if (canvas) releaseCanvas(canvas);
  }
  return buildImageAudit({
    stage: "postflight",
    metadataScan,
    visibleScan,
    warnings,
  });
}
