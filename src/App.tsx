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
      const ctx = canvas.getContext("2d");

      if (!ctx) throw new Error("Could not get canvas context");

      // --- Step 1: Shake ---
      updateStep("shake", { status: "running", progress: 10 });
      await delay(500, signal); // Artificial delay for UX

      await applyShake(ctx, img, DEFAULT_OPTIONS.shake, signal);

      updateStep("shake", { status: "done", progress: 100 });

      // --- Step 2: Stir ---
      updateStep("stir", { status: "running", progress: 10 });
      await delay(500, signal);

      await applyStir(ctx, DEFAULT_OPTIONS.stir, signal);

      updateStep("stir", { status: "done", progress: 100 });

      // --- Step 3: Crush ---
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
    <div className="text-foreground flex min-h-screen flex-col font-sans selection:bg-yellow-300 selection:text-black">
      <div className="bg-background z-0 flex items-center bg-[linear-gradient(to_right,#80808022_1px,transparent_1px),linear-gradient(to_bottom,#80808022_1px,transparent_1px)] bg-size-[70px_70px] p-4 md:p-4 lg:h-dvh">
        <main
          role="main"
          className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 lg:grid-cols-12"
        >
          {/* Header - First on mobile, part of left panel on desktop */}
          <div className="order-1 lg:order-1 lg:col-span-4">
            <Header />
          </div>

          {/* Right Panel: Workspace - Second on mobile, right on desktop */}
          <div className="order-2 space-y-6 lg:order-2 lg:col-span-8 lg:row-span-2">
            {statusMessage && (
              <Alert
                variant={statusMessage.variant}
                className="border-foreground rounded-none border-2"
              >
                <AlertTitle>{statusMessage.title}</AlertTitle>
                <AlertDescription>{statusMessage.description}</AlertDescription>
              </Alert>
            )}

            {/* Upload Area */}
            {!originalImage && (
              <div className="flex h-full flex-col justify-center">
                <ImageUploader
                  onImageSelect={handleImageSelect}
                  className="h-96"
                />
              </div>
            )}

            {/* Preview Area */}
            {originalImage && (
              <div className="animate-in fade-in slide-in-from-bottom-4 grid gap-6 duration-500">
                <ActionBar
                  fileName={originalImage.name}
                  isProcessing={isProcessing}
                  hasProcessedImage={!!processedImageUrl}
                  onReset={reset}
                  onCancel={cancelProcessing}
                  onProcess={processPipeline}
                />

                <ImageComparison
                  originalImageUrl={originalImageUrl!}
                  processedImageUrl={processedImageUrl}
                  processedFileName={processedFileName}
                />
              </div>
            )}

            {/* Hidden Canvas for processing */}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Pipeline - Third on mobile, part of left panel on desktop */}
          <div className="order-3 space-y-2 lg:order-1 lg:col-span-4 lg:row-start-2">
            <h2 className="border-foreground mb-4 inline-block border-b-4 text-2xl font-bold uppercase">
              Pipeline
            </h2>
            <PipelineSteps steps={steps} />

            {isProcessing && (
              <div className="border-foreground bg-foreground text-background mt-6 animate-pulse border-2 p-4 font-mono">
                PROCESSING IN PROGRESS...
              </div>
            )}
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}

export default App;
