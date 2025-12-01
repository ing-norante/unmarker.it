import { useState, useRef, useEffect } from "react";
import { ImageUploader } from "@/components/ImageUploader";
import { PipelineSteps } from "@/components/PipelineSteps";
import { Header } from "@/components/Header";
import { ActionBar } from "@/components/ActionBar";
import { ImageComparison } from "@/components/ImageComparison";
import { Footer } from "@/components/Footer";
import type { PipelineStepState, PipelineStepId } from "./lib/types";
import {
  applyShake,
  applyStir,
  applyCrush,
  DEFAULT_OPTIONS,
} from "./lib/pipeline";
import { generateCameraLikeFilename } from "./lib/utils";

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

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      if (originalImageUrl) URL.revokeObjectURL(originalImageUrl);
      if (processedImageUrl) URL.revokeObjectURL(processedImageUrl);
    };
  }, [originalImageUrl, processedImageUrl]);

  const handleImageSelect = (file: File) => {
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
    if (!originalImage || !canvasRef.current) return;

    setIsProcessing(true);
    setProcessedImageUrl(null); // Clear previous result

    // Reset all to idle first
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "idle", progress: 0 })));

    try {
      // Load image to get dimensions
      const img = new Image();
      img.src = URL.createObjectURL(originalImage);
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const canvas = canvasRef.current;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");

      if (!ctx) throw new Error("Could not get canvas context");

      // --- Step 1: Shake ---
      updateStep("shake", { status: "running", progress: 10 });
      await new Promise((r) => setTimeout(r, 500)); // Artificial delay for UX

      await applyShake(ctx, img, DEFAULT_OPTIONS.shake);

      updateStep("shake", { status: "done", progress: 100 });

      // --- Step 2: Stir ---
      updateStep("stir", { status: "running", progress: 10 });
      await new Promise((r) => setTimeout(r, 500));

      await applyStir(ctx, DEFAULT_OPTIONS.stir);

      updateStep("stir", { status: "done", progress: 100 });

      // --- Step 3: Crush ---
      updateStep("crush", { status: "running", progress: 10 });
      await new Promise((r) => setTimeout(r, 500));

      const resultDataUrl = await applyCrush(canvas, DEFAULT_OPTIONS.crush);
      const generatedFileName = generateCameraLikeFilename();

      setProcessedImageUrl(resultDataUrl);
      setProcessedFileName(generatedFileName);
      updateStep("crush", { status: "done", progress: 100 });
    } catch (error) {
      console.error("Pipeline failed", error);
      // Mark current running step as error
      setSteps((prev) =>
        prev.map((s) =>
          s.status === "running"
            ? { ...s, status: "error", error: "Failed" }
            : s,
        ),
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setOriginalImage(null);
    setOriginalImageUrl(null);
    setProcessedImageUrl(null);
    setProcessedFileName(null);
    setSteps(INITIAL_STEPS);
  };

  return (
    <div className="text-foreground flex min-h-screen flex-col font-sans selection:bg-yellow-300 selection:text-black">
      <div className="bg-background h-dvh z-0 flex items-center bg-[linear-gradient(to_right,#80808022_1px,transparent_1px),linear-gradient(to_bottom,#80808022_1px,transparent_1px)] bg-size-[70px_70px] p-4 md:p-4">
        <main role="main" className="mx-auto w-full grid max-w-7xl grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Header - First on mobile, part of left panel on desktop */}
          <div className="order-1 lg:order-1 lg:col-span-4">
            <Header />
          </div>

          {/* Right Panel: Workspace - Second on mobile, right on desktop */}
          <div className="order-2 space-y-6 lg:order-2 lg:col-span-8 lg:row-span-2">
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
