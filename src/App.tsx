import { useState, useRef, useEffect } from "react";
import { ImageUploader } from "@/components/ImageUploader";
import { PipelineSteps } from "@/components/PipelineSteps";
import { Header } from "@/components/Header";
import { ActionBar } from "@/components/ActionBar";
import { ImageComparison } from "@/components/ImageComparison";
import { Footer } from "@/components/Footer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { PipelineStepState, PipelineStepId } from "./lib/types";
import {
  applyShake,
  applyStir,
  applyCrush,
  DEFAULT_OPTIONS,
} from "./lib/pipeline";
import { generateCameraLikeFilename } from "./lib/utils";
import { processGeminiVisibleWatermark } from "./lib/geminiWorkerClient";
import type { GeminiWorkerProgressStage } from "./lib/types";

const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_MEGAPIXELS = 40;

type StatusMessage = {
  variant: "default" | "destructive";
  title: string;
  description: string;
};

const INITIAL_STEPS: PipelineStepState[] = [
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

const loadImageDimensions = async (file: File) => {
  const img = new Image();
  const objectUrl = URL.createObjectURL(file);

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to decode image"));
      img.src = objectUrl;
    });

    return { width: img.width, height: img.height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const loadImageFromFile = async (file: File, signal?: AbortSignal) => {
  assertNotAborted(signal);

  const img = new Image();
  const objectUrl = URL.createObjectURL(file);

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = objectUrl;
    });
    assertNotAborted(signal);
    return img;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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

function App() {
  const [originalImage, setOriginalImage] = useState<File | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(
    null,
  );
  const [processedFileName, setProcessedFileName] = useState<string | null>(
    null,
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [steps, setSteps] = useState<PipelineStepState[]>(INITIAL_STEPS);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(
    null,
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      if (originalImageUrl) URL.revokeObjectURL(originalImageUrl);
      if (processedImageUrl) URL.revokeObjectURL(processedImageUrl);
    };
  }, [originalImageUrl, processedImageUrl]);

  const handleImageSelect = async (file: File) => {
    setStatusMessage(null);

    if (!file.type.startsWith("image/")) {
      setStatusMessage({
        variant: "destructive",
        title: "Unsupported file type",
        description: "Please select a valid image file.",
      });
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setStatusMessage({
        variant: "destructive",
        title: "File is too large",
        description: `Please use an image up to ${MAX_FILE_SIZE_MB} MB.`,
      });
      return;
    }

    let dimensions: { width: number; height: number };
    try {
      dimensions = await loadImageDimensions(file);
    } catch {
      setStatusMessage({
        variant: "destructive",
        title: "Could not read image",
        description:
          "This file could not be decoded. Try another image and retry.",
      });
      return;
    }

    const megapixels = (dimensions.width * dimensions.height) / 1_000_000;
    if (megapixels > MAX_MEGAPIXELS) {
      setStatusMessage({
        variant: "destructive",
        title: "Image resolution is too high",
        description: `Please use an image up to ${MAX_MEGAPIXELS} megapixels.`,
      });
      return;
    }

    if (originalImageUrl) URL.revokeObjectURL(originalImageUrl);
    if (processedImageUrl) URL.revokeObjectURL(processedImageUrl);

    setOriginalImage(file);
    setOriginalImageUrl(URL.createObjectURL(file));
    setProcessedImageUrl(null);
    setProcessedFileName(null);

    // Reset steps
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "idle", progress: 0 })));
  };

  const updateStep = (
    id: PipelineStepId,
    update: Partial<PipelineStepState>,
  ) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...update } : s)),
    );
  };

  const processPipeline = async () => {
    if (!originalImage || !canvasRef.current || isProcessing) return;

    setStatusMessage(null);
    setIsProcessing(true);
    setProcessedImageUrl(null); // Clear previous result

    // Reset all to idle first
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "idle", progress: 0 })));
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const { signal } = abortController;

    try {
      const img = await loadImageFromFile(originalImage, signal);

      const canvas = canvasRef.current;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      if (!ctx) throw new Error("Could not get canvas context");

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // --- Step 1: Gemini Scan / Restore ---
      updateStep("gemini-detect", { status: "running", progress: 10 });
      const geminiResult = await processGeminiVisibleWatermark(
        ctx.getImageData(0, 0, canvas.width, canvas.height),
        {
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

      // --- Step 2: Shake ---
      updateStep("shake", { status: "running", progress: 10 });
      await delay(500, signal); // Artificial delay for UX

      const shakeSource = createCanvasSnapshot(canvas);
      await applyShake(ctx, shakeSource, DEFAULT_OPTIONS.shake, signal);

      updateStep("shake", { status: "done", progress: 100 });

      // --- Step 3: Stir ---
      updateStep("stir", { status: "running", progress: 10 });
      await delay(500, signal);

      await applyStir(ctx, DEFAULT_OPTIONS.stir, signal);

      updateStep("stir", { status: "done", progress: 100 });

      // --- Step 4: Crush ---
      updateStep("crush", { status: "running", progress: 10 });
      await delay(500, signal);

      const resultDataUrl = await applyCrush(
        canvas,
        DEFAULT_OPTIONS.crush,
        signal,
      );
      assertNotAborted(signal);
      const generatedFileName = generateCameraLikeFilename();

      setProcessedImageUrl(resultDataUrl);
      setProcessedFileName(generatedFileName);
      updateStep("crush", { status: "done", progress: 100 });
    } catch (error) {
      if (isAbortError(error)) {
        setStatusMessage({
          variant: "default",
          title: "Processing cancelled",
          description: "You can adjust the image and run the pipeline again.",
        });
        setSteps((prev) =>
          prev.map((s) =>
            s.status === "running"
              ? { ...s, status: "idle", progress: 0, error: undefined }
              : s,
          ),
        );
      } else {
        console.error("Pipeline failed", error);
        setStatusMessage({
          variant: "destructive",
          title: "Could not process image",
          description:
            "Try a smaller or different file. If this keeps happening, reload and retry.",
        });
        // Mark current running step as error
        setSteps((prev) =>
          prev.map((s) =>
            s.status === "running"
              ? { ...s, status: "error", error: "Failed" }
              : s,
          ),
        );
      }
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      setIsProcessing(false);
    }
  };

  const cancelProcessing = () => {
    abortControllerRef.current?.abort();
  };

  const reset = () => {
    abortControllerRef.current?.abort();
    setOriginalImage(null);
    setOriginalImageUrl(null);
    setProcessedImageUrl(null);
    setProcessedFileName(null);
    setStatusMessage(null);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "idle", progress: 0 })));
  };

  return (
    <div className="bg-background text-foreground selection:bg-primary selection:text-primary-foreground flex min-h-dvh p-0 font-sans lg:px-8">
      <div className="bg-background mx-auto flex min-h-dvh w-full max-w-[1500px] flex-col overflow-hidden">
        <div className="relative flex flex-col px-6 py-8 lg:min-h-0 lg:px-12 lg:py-10">
          <main
            role="main"
            className="relative z-10 mx-auto grid w-full max-w-[1340px] grid-cols-1 content-start gap-8 lg:min-h-0 lg:grid-cols-[minmax(30rem,34rem)_minmax(0,1fr)] lg:items-start lg:gap-x-12"
          >
            {/* Hero + pipeline: one column on desktop; hero pinned, steps scroll below */}
            <div className="contents lg:col-start-1 lg:flex lg:min-h-0 lg:flex-col lg:gap-4">
              <Header className="order-1 shrink-0 lg:order-0" />

              <aside className="order-3 flex min-h-0 flex-col gap-4 lg:order-0 lg:flex-1">
                <div className="flex items-center gap-4">
                  <h2 className="text-muted-foreground shrink-0 text-base font-black tracking-[-0.02em]">
                    PIPELINE
                  </h2>
                </div>

                <div className="min-h-0 flex-1 lg:overflow-y-auto lg:overscroll-contain">
                  <PipelineSteps steps={steps} />

                  {isProcessing && (
                    <div className="bg-card text-card-foreground mt-4 animate-pulse border p-3 text-sm">
                      Processing in progress...
                    </div>
                  )}
                </div>
              </aside>
            </div>

            {/* Workspace before pipeline on mobile; full-height right column on desktop */}
            <section className="order-2 flex min-w-0 flex-col lg:col-start-2 lg:min-h-0">
              {statusMessage && (
                <Alert
                  variant={statusMessage.variant}
                  className="mb-4 shrink-0"
                >
                  <AlertTitle>{statusMessage.title}</AlertTitle>
                  <AlertDescription>
                    {statusMessage.description}
                  </AlertDescription>
                </Alert>
              )}

              {!originalImage && (
                <div className="flex min-h-[min(62vh,50rem)] flex-col lg:min-h-[min(70vh,50rem)] lg:flex-1">
                  <ImageUploader
                    onImageSelect={handleImageSelect}
                    className="min-h-[min(62vh,50rem)] flex-1 lg:min-h-[min(70vh,50rem)]"
                  />
                </div>
              )}

              {originalImage && (
                <div className="animate-in fade-in slide-in-from-bottom-4 flex flex-col gap-4 duration-500 lg:min-h-0 lg:flex-1">
                  <ActionBar
                    fileName={originalImage.name}
                    isProcessing={isProcessing}
                    hasProcessedImage={!!processedImageUrl}
                    onReset={reset}
                    onCancel={cancelProcessing}
                    onProcess={processPipeline}
                    className="shrink-0"
                  />

                  <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
                    <ImageComparison
                      originalImageUrl={originalImageUrl!}
                      processedImageUrl={processedImageUrl}
                      processedFileName={processedFileName}
                    />
                  </div>
                </div>
              )}

              <canvas ref={canvasRef} className="hidden" />
            </section>
          </main>
        </div>
        <div className="px-6 pb-6 lg:px-12 lg:pb-8">
          <Footer />
        </div>
      </div>
    </div>
  );
}

export default App;

function updateGeminiProgress(
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
