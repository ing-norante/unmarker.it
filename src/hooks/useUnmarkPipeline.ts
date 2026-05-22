import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import {
  applyCrush,
  applyShake,
  applyStir,
  DEFAULT_OPTIONS,
} from "@/lib/pipeline";
import {
  createInitialPipelineSteps,
  markRunningPipelineStepsAsError,
  resetRunningPipelineSteps,
  updateGeminiProgress,
} from "@/lib/pipelineSteps";
import { withObjectUrl } from "@/lib/objectUrl";
import type {
  GeminiDetectionResult,
  PipelineStepId,
  PipelineStepState,
  StatusMessage,
} from "@/lib/types";
import { generateCameraLikeFilename } from "@/lib/utils";
import { processGeminiVisibleWatermark } from "@/lib/geminiWorkerClient";

type SetStatusMessage = (message: StatusMessage | null) => void;

interface UseUnmarkPipelineOptions {
  originalImage: File | null;
  setStatusMessage: SetStatusMessage;
}

export type PipelineRunResult =
  | {
      ok: true;
      blob: Blob;
      fileName: string;
      objectUrl: string | null;
      detection: GeminiDetectionResult;
      skippedVisibleRestore: boolean;
    }
  | {
      ok: false;
      reason: "cancelled" | "error";
    };

export interface ProcessPipelineOptions {
  file?: File;
  detectionHint?: GeminiDetectionResult | null;
}

export function useUnmarkPipeline({
  originalImage,
  setStatusMessage,
}: UseUnmarkPipelineOptions) {
  const [processedFileName, setProcessedFileName] = useState<string | null>(
    null,
  );
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [crushQuality, setCrushQuality] = useState(
    DEFAULT_OPTIONS.crush!.quality,
  );
  const [steps, setSteps] = useState<PipelineStepState[]>(
    createInitialPipelineSteps,
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const {
    url: processedImageUrl,
    setObjectUrl: setProcessedObjectUrl,
    clearObjectUrl: clearProcessedObjectUrl,
  } = useObjectUrl();

  const updateStep = useCallback(
    (id: PipelineStepId, update: Partial<PipelineStepState>) => {
      setSteps((previousSteps) =>
        previousSteps.map((step) =>
          step.id === id ? { ...step, ...update } : step,
        ),
      );
    },
    [],
  );

  const resetSteps = useCallback(() => {
    setSteps(createInitialPipelineSteps());
  }, []);

  const clearProcessedImage = useCallback(() => {
    clearProcessedObjectUrl();
    setProcessedFileName(null);
    setProcessedBlob(null);
  }, [clearProcessedObjectUrl]);

  const cancelProcessing = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const resetPipeline = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    clearProcessedImage();
    setIsProcessing(false);
    resetSteps();
  }, [clearProcessedImage, resetSteps]);

  const processPipeline = useCallback(
    async (
      options: ProcessPipelineOptions = {},
    ): Promise<PipelineRunResult> => {
      const sourceFile = options.file ?? originalImage;

      if (!sourceFile || !canvasRef.current || isProcessing) {
        return { ok: false, reason: "error" };
      }

      setStatusMessage(null);
      setIsProcessing(true);
      clearProcessedImage();
      resetSteps();

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const { signal } = abortController;

      try {
        const img = await loadImageFromFile(sourceFile, signal);

        const canvas = canvasRef.current;
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        if (!ctx) {
          throw new Error("Could not get canvas context");
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        updateStep("gemini-detect", { status: "running", progress: 10 });
        const geminiResult = await processGeminiVisibleWatermark(
          ctx.getImageData(0, 0, canvas.width, canvas.height),
          {
            detectionHint: options.detectionHint,
            signal,
            onProgress: (stage) => {
              updateGeminiProgress(stage, updateStep);
            },
          },
        );
        assertNotAborted(signal);

        ctx.putImageData(geminiResult.imageData, 0, 0);
        updateStep("gemini-detect", { status: "done", progress: 100 });
        updateStep("gemini-restore", {
          status: geminiResult.skipped ? "skipped" : "done",
          progress: 100,
        });

        updateStep("shake", { status: "running", progress: 10 });
        await delay(500, signal);

        const shakeSource = createCanvasSnapshot(canvas);
        await applyShake(ctx, shakeSource, DEFAULT_OPTIONS.shake, signal);
        updateStep("shake", { status: "done", progress: 100 });

        updateStep("stir", { status: "running", progress: 10 });
        await delay(500, signal);

        await applyStir(ctx, DEFAULT_OPTIONS.stir, signal);
        updateStep("stir", { status: "done", progress: 100 });

        updateStep("crush", { status: "running", progress: 10 });
        await delay(500, signal);

        const resultBlob = await applyCrush(
          canvas,
          { quality: crushQuality },
          signal,
        );
        assertNotAborted(signal);

        const fileName = generateCameraLikeFilename();
        const objectUrl = setProcessedObjectUrl(resultBlob);

        setProcessedBlob(resultBlob);
        setProcessedFileName(fileName);
        updateStep("crush", { status: "done", progress: 100 });
        toast.success("Image processed.");
        return {
          ok: true,
          blob: resultBlob,
          fileName,
          objectUrl,
          detection: geminiResult.detection,
          skippedVisibleRestore: geminiResult.skipped,
        };
      } catch (error) {
        if (isAbortError(error)) {
          setStatusMessage({
            variant: "default",
            title: "Processing cancelled",
            description: "You can adjust the image and run the pipeline again.",
          });
          toast("Processing cancelled.");
          setSteps(resetRunningPipelineSteps);
          return { ok: false, reason: "cancelled" };
        } else {
          console.error("Pipeline failed", error);
          setStatusMessage({
            variant: "destructive",
            title: "Could not process image",
            description:
              "Try a smaller or different file. If this keeps happening, reload and retry.",
          });
          toast.error("Could not process image.");
          setSteps(markRunningPipelineStepsAsError);
          return { ok: false, reason: "error" };
        }
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
        setIsProcessing(false);
      }
    },
    [
      clearProcessedImage,
      crushQuality,
      isProcessing,
      originalImage,
      resetSteps,
      setProcessedObjectUrl,
      setStatusMessage,
      updateStep,
    ],
  );

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    canvasRef,
    processedBlob,
    processedImageUrl,
    processedFileName,
    isProcessing,
    crushQuality,
    setCrushQuality,
    steps,
    processPipeline,
    cancelProcessing,
    resetPipeline,
  };
}

const createAbortError = () => {
  const error = new Error("Processing cancelled");
  error.name = "AbortError";
  return error;
};

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";

const assertNotAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw createAbortError();
  }
};

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const timeout = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(createAbortError());
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });

const loadImageFromFile = async (file: File, signal?: AbortSignal) => {
  assertNotAborted(signal);

  const img = new Image();
  return withObjectUrl(file, async (objectUrl) => {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = objectUrl;
    });
    assertNotAborted(signal);
    return img;
  });
};

const createCanvasSnapshot = (canvas: HTMLCanvasElement) => {
  const snapshot = document.createElement("canvas");
  snapshot.width = canvas.width;
  snapshot.height = canvas.height;
  const snapshotCtx = snapshot.getContext("2d");
  if (!snapshotCtx) {
    throw new Error("Could not create canvas snapshot");
  }
  snapshotCtx.drawImage(canvas, 0, 0);
  return snapshot;
};
