import { useState, useRef, useEffect } from "react";
import { ImageUploader } from "./components/ImageUploader";
import { PipelineSteps } from "./components/PipelineSteps";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import type { PipelineStepState, PipelineStepId } from "./lib/types";
import {
  applyShake,
  applyStir,
  applyCrush,
  DEFAULT_OPTIONS,
} from "./lib/pipeline";
import { Download, RefreshCcw, Zap } from "lucide-react";

const INITIAL_STEPS: PipelineStepState[] = [
  {
    id: "shake",
    label: "Shake (Geometry)",
    description: "Micro-rotation & zoom",
    status: "idle",
    progress: 0,
  },
  {
    id: "stir",
    label: "Stir (Noise)",
    description: "Subtle RGB perturbation",
    status: "idle",
    progress: 0,
  },
  {
    id: "crush",
    label: "Crush (Quantization)",
    description: "JPEG compression",
    status: "idle",
    progress: 0,
  },
];

function App() {
  const [originalImage, setOriginalImage] = useState<File | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(
    null
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
  }, []);

  const handleImageSelect = (file: File) => {
    if (originalImageUrl) URL.revokeObjectURL(originalImageUrl);
    if (processedImageUrl) URL.revokeObjectURL(processedImageUrl);

    setOriginalImage(file);
    setOriginalImageUrl(URL.createObjectURL(file));
    setProcessedImageUrl(null);

    // Reset steps
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "idle", progress: 0 })));
  };

  const updateStep = (
    id: PipelineStepId,
    update: Partial<PipelineStepState>
  ) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...update } : s))
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

      setProcessedImageUrl(resultDataUrl);
      updateStep("crush", { status: "done", progress: 100 });
    } catch (error) {
      console.error("Pipeline failed", error);
      // Mark current running step as error
      setSteps((prev) =>
        prev.map((s) =>
          s.status === "running"
            ? { ...s, status: "error", error: "Failed" }
            : s
        )
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setOriginalImage(null);
    setOriginalImageUrl(null);
    setProcessedImageUrl(null);
    setSteps(INITIAL_STEPS);
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 font-sans selection:bg-yellow-300 selection:text-black">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Panel: Info & Status */}
        <div className="lg:col-span-4 space-y-8">
          <header className="space-y-4">
            <h1 className="text-6xl font-black tracking-tighter border-b-8 border-black pb-2 uppercase">
              Perturba
              <br />
              Pix
            </h1>
            <p className="text-xl font-medium leading-relaxed border-l-4 border-black pl-4">
              Shake off invisible AI watermarks. <br />
              <span className="bg-yellow-300 px-1 font-bold">
                100% Client-side.
              </span>
            </p>
          </header>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold uppercase border-b-4 border-black inline-block mb-4">
              Pipeline
            </h2>
            <PipelineSteps steps={steps} />
          </div>

          {isProcessing && (
            <div className="p-4 border-2 border-black bg-black text-white font-mono animate-pulse">
              PROCESSING IN PROGRESS...
            </div>
          )}
        </div>

        {/* Right Panel: Workspace */}
        <div className="lg:col-span-8 space-y-6">
          {/* Upload Area */}
          {!originalImage && (
            <div className="h-full flex flex-col justify-center">
              <ImageUploader
                onImageSelect={handleImageSelect}
                className="h-96"
              />
            </div>
          )}

          {/* Preview Area */}
          {originalImage && (
            <div className="grid gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Action Bar */}
              <div className="flex justify-between items-center p-4 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <div className="font-bold truncate max-w-[200px]">
                  {originalImage.name}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={reset}
                    disabled={isProcessing}
                    className="border-2 border-black rounded-none hover:bg-red-100"
                  >
                    <RefreshCcw className="w-4 h-4 mr-2" /> Reset
                  </Button>
                  <Button
                    onClick={processPipeline}
                    disabled={isProcessing || !!processedImageUrl}
                    variant="neobrutalist"
                    className={processedImageUrl ? "opacity-50" : ""}
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    {isProcessing ? "Processing..." : "Shake It"}
                  </Button>
                </div>
              </div>

              {/* Images Comparison */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Original */}
                <Card className="neobrutalist-card overflow-hidden bg-white">
                  <div className="bg-yellow-300 border-b-2 border-black p-2 text-center font-bold uppercase text-sm">
                    Original
                  </div>
                  <div className="aspect-square relative flex items-center justify-center p-4 bg-gray-100/50">
                    <img
                      src={originalImageUrl!}
                      alt="Original"
                      className="max-w-full max-h-full object-contain shadow-md"
                    />
                  </div>
                </Card>

                {/* Processed */}
                <Card className="neobrutalist-card overflow-hidden bg-white">
                  <div className="bg-green-300 border-b-2 border-black p-2 text-center font-bold uppercase text-sm">
                    {processedImageUrl ? "Processed Result" : "Preview"}
                  </div>
                  <div className="aspect-square relative flex items-center justify-center p-4 bg-gray-100/50">
                    {processedImageUrl ? (
                      <img
                        src={processedImageUrl}
                        alt="Processed"
                        className="max-w-full max-h-full object-contain shadow-md"
                      />
                    ) : (
                      <div className="text-center text-muted-foreground p-8 border-2 border-dashed border-gray-300">
                        <p>Result will appear here</p>
                      </div>
                    )}
                  </div>
                  {processedImageUrl && (
                    <div className="p-4 border-t-2 border-black bg-white">
                      <a
                        href={processedImageUrl}
                        download={`shaken-${originalImage.name}`}
                      >
                        <Button
                          className="w-full font-bold border-2 border-black shadow-none hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] rounded-none"
                          size="lg"
                        >
                          <Download className="w-4 h-4 mr-2" /> Download
                          Processed JPEG
                        </Button>
                      </a>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* Hidden Canvas for processing */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>
    </div>
  );
}

export default App;
