import { useState } from "react";
import { ImageUploader } from "@/components/ImageUploader";
import { CrushQualityControl } from "@/components/CrushQualityControl";
import { PipelineSteps } from "@/components/PipelineSteps";
import { Header } from "@/components/Header";
import { ActionBar } from "@/components/ActionBar";
import { ImageComparison } from "@/components/ImageComparison";
import { Footer } from "@/components/Footer";
import { MetadataPanel } from "@/components/MetadataPanel";
import { ModeSelector } from "@/components/ModeSelector";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useMetadataWorkflow } from "@/hooks/useMetadataWorkflow";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import { useUnmarkPipeline } from "@/hooks/useUnmarkPipeline";
import {
  getFileModePolicy,
  validateFileForMode,
  type FileModePolicy,
} from "@/lib/fileValidation";
import type { AppMode, MetadataScanResult, StatusMessage } from "@/lib/types";

const HOMEPAGE_FACTS = [
  {
    title: "Images stay in the browser",
    body: "Unmarker.it processes browser-decodable images locally with Canvas API operations. There are no processing uploads, server-side image endpoints, or account requirements.",
  },
  {
    title: "Shake, stir, and crush pipeline",
    body: "The AI watermark remover can scan for the visible Gemini sparkle mark, restore marked pixels when detected, shift pixel-grid alignment, add low-amplitude RGB noise, and export a recompressed JPEG.",
  },
  {
    title: "Supported files and output",
    body: "The remover accepts browser-readable image files up to 40 megapixels and 25 MB. Metadata analysis supports PNG, JPEG, WebP, AVIF, HEIF, and JXL files.",
  },
  {
    title: "Designed for honest testing",
    body: "Results depend on the watermarking method, detector, input image, compression level, and downstream reuse. The tool is meant for privacy research, robustness testing, personal media workflows, and education.",
  },
] as const;

function App() {
  const [appMode, setAppMode] = useState<AppMode>("unmark");
  const [originalImage, setOriginalImage] = useState<File | null>(null);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(
    null,
  );
  const {
    url: originalImageUrl,
    setObjectUrl: setOriginalImageUrl,
    clearObjectUrl: clearOriginalImageUrl,
  } = useObjectUrl();

  const {
    canvasRef,
    processedImageUrl,
    processedFileName,
    isProcessing,
    crushQuality,
    setCrushQuality,
    steps,
    processPipeline,
    cancelProcessing,
    resetPipeline,
  } = useUnmarkPipeline({
    originalImage,
    setStatusMessage,
  });

  const {
    metadataScanResult,
    metadataCleanResult,
    isMetadataScanning,
    isMetadataCleaning,
    metadataCanDownloadClean,
    scanMetadata,
    downloadCleanCopy,
    resetMetadataWorkflow,
  } = useMetadataWorkflow({
    originalImage,
    setStatusMessage,
  });
  const filePolicy = getFileModePolicy(appMode);

  const reset = () => {
    resetPipeline();
    resetMetadataWorkflow();
    clearOriginalImageUrl();
    setOriginalImage(null);
    setStatusMessage(null);
  };

  const handleModeChange = (mode: AppMode) => {
    if (mode === appMode) {
      return;
    }

    reset();
    setAppMode(mode);
  };

  const handleImageSelect = async (file: File) => {
    setStatusMessage(null);
    resetMetadataWorkflow();

    const validation = await validateFileForMode(appMode, file);
    if (!validation.ok) {
      setStatusMessage(validation.statusMessage);
      return;
    }

    resetPipeline();
    setOriginalImage(file);
    setOriginalImageUrl(file);
    if (appMode === "metadata") {
      await scanMetadata(file);
    }
  };

  const modeBusy = isProcessing || isMetadataScanning || isMetadataCleaning;

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
              <ModeSelector
                mode={appMode}
                onModeChange={handleModeChange}
                disabled={modeBusy}
                className="order-2 shrink-0 lg:order-0"
              />

              <aside className="order-3 flex min-h-0 flex-col gap-4 lg:order-0 lg:flex-1">
                <div className="flex items-center gap-4">
                  <h2 className="text-muted-foreground shrink-0 text-base font-black tracking-[-0.02em]">
                    {appMode === "unmark" ? "PIPELINE" : "METADATA"}
                  </h2>
                  <Separator className="flex-1" />
                </div>

                <ScrollArea className="min-h-0 flex-1 lg:overscroll-contain">
                  {appMode === "unmark" ? (
                    <>
                      <PipelineSteps steps={steps} />
                      <CrushQualityControl
                        value={crushQuality}
                        onChange={setCrushQuality}
                        disabled={isProcessing}
                      />

                      {isProcessing && (
                        <div className="bg-card text-card-foreground mt-4 flex flex-col gap-2 border p-3 text-sm">
                          <span>Processing in progress...</span>
                          <Skeleton className="h-1 w-full" />
                        </div>
                      )}
                    </>
                  ) : (
                    <MetadataSidebar
                      result={metadataScanResult}
                      isScanning={isMetadataScanning}
                    />
                  )}
                </ScrollArea>
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
                    accept={filePolicy.accept}
                    title="Drag an image"
                    description={
                      "Drop it here, or click to select a file from your device."
                    }
                    details={<FilePolicyDetails policy={filePolicy} />}
                    className="min-h-[min(62vh,50rem)] flex-1 lg:min-h-[min(70vh,50rem)]"
                  />
                </div>
              )}

              {originalImage && appMode === "unmark" && (
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

                  <ScrollArea className="lg:min-h-0 lg:flex-1 lg:overscroll-contain">
                    <ImageComparison
                      originalImageUrl={originalImageUrl!}
                      processedImageUrl={processedImageUrl}
                      processedFileName={processedFileName}
                    />
                  </ScrollArea>
                </div>
              )}

              {originalImage && appMode === "metadata" && (
                <ScrollArea className="lg:min-h-0 lg:flex-1 lg:overscroll-contain">
                  <MetadataPanel
                    file={originalImage}
                    fileUrl={originalImageUrl}
                    scanResult={metadataScanResult}
                    cleanResult={metadataCleanResult}
                    isScanning={isMetadataScanning}
                    isCleaning={isMetadataCleaning}
                    canDownloadClean={metadataCanDownloadClean}
                    onReset={reset}
                    onDownloadClean={downloadCleanCopy}
                  />
                </ScrollArea>
              )}

              <canvas ref={canvasRef} className="hidden" />
            </section>
          </main>
        </div>
        <div className="px-6 pb-8 lg:px-12">
          <HomepageFacts />
        </div>
        <div className="px-6 pb-6 lg:px-12 lg:pb-8">
          <Footer />
        </div>
      </div>
    </div>
  );
}

export default App;

function HomepageFacts() {
  return (
    <section
      aria-labelledby="homepage-facts-heading"
      className="mx-auto w-full max-w-[1340px] border-t pt-8"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-10">
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-xs font-black uppercase">
            Core facts
          </p>
          <h2
            id="homepage-facts-heading"
            className="text-foreground text-2xl leading-tight font-black sm:text-3xl"
          >
            Client-side AI watermark removal, with no image uploads.
          </h2>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed font-medium sm:text-base">
            Unmarker.it is a browser-based image processing tool for disrupting
            invisible AI watermark signals. The app runs locally, exports a
            lossy JPEG, and does not call any API or server-side image
            processing endpoint.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {HOMEPAGE_FACTS.map((fact) => (
            <article
              key={fact.title}
              className="bg-card text-card-foreground flex min-h-36 flex-col gap-2 border p-4"
            >
              <h3 className="text-sm leading-tight font-black">{fact.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed font-medium">
                {fact.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FilePolicyDetails({ policy }: { policy: FileModePolicy }) {
  return (
    <div className="text-muted-foreground text-xs leading-6 font-medium sm:text-sm">
      <span>{policy.supportedCopy}</span>
      {policy.limitCopy.map((limit) => (
        <span key={limit} className="block">
          {limit}
        </span>
      ))}
    </div>
  );
}

function MetadataSidebar({
  result,
  isScanning,
}: {
  result: MetadataScanResult | null;
  isScanning: boolean;
}) {
  const signalCount = result?.signals.length ?? 0;

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-3 border p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold">
          {isScanning ? "Scanning" : result ? "Scan complete" : "Idle"}
        </span>
        <Badge variant="outline">{result?.format ?? "none"}</Badge>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {result
          ? `${signalCount} AI metadata signal${signalCount === 1 ? "" : "s"} found.`
          : "Upload a file to scan."}
      </p>
      {isScanning && <Skeleton className="h-1 w-full" />}
    </div>
  );
}
