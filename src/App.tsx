import { useState } from "react";
import { ImageUploader } from "@/components/ImageUploader";
import { CrushQualityControl } from "@/components/CrushQualityControl";
import { PipelineSteps } from "@/components/PipelineSteps";
import { Header } from "@/components/Header";
import { ActionBar } from "@/components/ActionBar";
import { ImageComparison } from "@/components/ImageComparison";
import { Footer } from "@/components/Footer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getWorkflowFilePolicy,
  type FileModePolicy,
} from "@/lib/fileValidation";
import { useImageWorkflow } from "@/hooks/useImageWorkflow";
import type { StatusMessage, WorkflowPhase } from "@/lib/types";

const HOMEPAGE_FACTS = [
  {
    title: "Images stay in the browser",
    body: "Unmarker.it processes browser-decodable images locally with Canvas API operations. There are no processing uploads, server-side image endpoints, or account requirements.",
  },
  {
    title: "Analyze, remove, verify",
    body: "Upload once: Unmarker.it scans metadata and visible marks, runs the local watermark disruption pipeline when possible, then checks the generated JPEG again.",
  },
  {
    title: "Supported files and output",
    body: "Processing accepts browser-readable image files up to 40 megapixels and 25 MB. Analysis-only supports PNG, JPEG, WebP, AVIF, HEIF, and JXL metadata.",
  },
  {
    title: "Designed for honest testing",
    body: "Results depend on the watermarking method, detector, input image, compression level, and downstream reuse. The tool is meant for privacy research, robustness testing, personal media workflows, and education.",
  },
] as const;

function App() {
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(
    null,
  );
  const {
    state,
    originalImage,
    originalImageUrl,
    canvasRef,
    processedImageUrl,
    processedFileName,
    isProcessing,
    isMetadataCleaning,
    workflowWarnings,
    crushQuality,
    setCrushQuality,
    steps,
    selectImage,
    reset,
    cancel,
    retry,
    reprocess,
    downloadMetadataClean,
  } = useImageWorkflow({
    setStatusMessage,
  });
  const filePolicy = getWorkflowFilePolicy();
  const showCrushQuality =
    !!originalImage &&
    state.phase !== "preflight-scanning" &&
    state.phase !== "analysis-only" &&
    state.phase !== "idle";
  const workflowBusy =
    state.phase === "preflight-scanning" ||
    state.phase === "processing" ||
    state.phase === "postflight-scanning";

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
                  <h2 className="text-muted-foreground shrink-0 text-base font-black tracking-[-0.02em] sm:text-lg">
                    WORKFLOW
                  </h2>
                  <Separator className="flex-1" />
                </div>

                <ScrollArea className="min-h-0 flex-1 lg:overscroll-contain">
                  <div className="flex flex-col gap-4">
                    <WorkflowSummary phase={state.phase} />
                    {state.phase !== "analysis-only" && (
                      <PipelineSteps steps={steps} />
                    )}
                    {showCrushQuality && (
                      <CrushQualityControl
                        value={crushQuality}
                        onChange={setCrushQuality}
                        disabled={isProcessing}
                      />
                    )}

                    {workflowBusy && (
                      <div className="bg-card text-card-foreground flex flex-col gap-2 border p-3 text-sm sm:p-4 sm:text-base">
                        <span>{getBusyCopy(state.phase)}</span>
                        <Skeleton className="h-1 w-full" />
                      </div>
                    )}
                  </div>
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
                    onImageSelect={selectImage}
                    accept={filePolicy.accept}
                    title="Drag an image"
                    description={
                      "Drop it here to analyze local AI signals, then remove watermarks automatically when processing is available."
                    }
                    details={<FilePolicyDetails policy={filePolicy} />}
                    className="min-h-[min(62vh,50rem)] flex-1 lg:min-h-[min(70vh,50rem)]"
                  />
                </div>
              )}

              {originalImage && originalImageUrl && (
                <div className="animate-in fade-in slide-in-from-bottom-4 flex flex-col gap-4 duration-500 lg:min-h-0 lg:flex-1">
                  <ActionBar
                    fileName={originalImage.name}
                    phase={state.phase}
                    hasProcessedImage={!!processedImageUrl}
                    processedImageUrl={processedImageUrl}
                    processedFileName={processedFileName}
                    canCleanMetadata={state.capabilities.canCleanMetadata}
                    isMetadataCleaning={isMetadataCleaning}
                    canProcess={state.capabilities.canProcess}
                    onReset={reset}
                    onCancel={cancel}
                    onRetry={retry}
                    onReprocess={reprocess}
                    onDownloadCleanMetadata={downloadMetadataClean}
                    className="shrink-0"
                  />

                  <ScrollArea className="lg:min-h-0 lg:flex-1 lg:overscroll-contain">
                    <ImageComparison
                      originalImageUrl={originalImageUrl}
                      processedImageUrl={processedImageUrl}
                      phase={state.phase}
                      preflightAudit={state.preflightAudit}
                      postflightAudit={state.postflightAudit}
                      workflowWarnings={workflowWarnings}
                    />
                  </ScrollArea>
                </div>
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
          <p className="text-muted-foreground text-ui-overline">Core facts</p>
          <h2
            id="homepage-facts-heading"
            className="text-foreground text-2xl leading-tight font-black sm:text-3xl"
          >
            Client-side AI watermark analysis and removal, with no image
            uploads.
          </h2>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed font-medium sm:text-base">
            Unmarker.it is a privacy-first browser tool that analyzes local AI
            provenance signals, removes supported visible marks, disrupts hidden
            watermark patterns, and verifies the generated JPEG again in your
            browser. No uploads, no servers, no data leaving your device.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {HOMEPAGE_FACTS.map((fact) => (
            <article
              key={fact.title}
              className="bg-card text-card-foreground flex min-h-36 flex-col gap-2 border p-4"
            >
              <h3 className="text-base leading-tight font-black sm:text-lg">
                {fact.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed font-medium sm:text-base">
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
    <div className="text-muted-foreground text-ui-body leading-6 sm:leading-7">
      <span>{policy.supportedCopy}</span>
      {policy.limitCopy.map((limit) => (
        <span key={limit} className="block">
          {limit}
        </span>
      ))}
    </div>
  );
}

function WorkflowSummary({ phase }: { phase: WorkflowPhase }) {
  return (
    <div className="bg-card text-card-foreground flex flex-col gap-3 border p-3 text-sm sm:p-4 sm:text-base">
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold">{getPhaseTitle(phase)}</span>
        <span className="text-muted-foreground text-ui-caption uppercase">
          {phase.replace(/-/g, " ")}
        </span>
      </div>
      <p className="text-muted-foreground text-ui-body">
        {getPhaseDescription(phase)}
      </p>
    </div>
  );
}

function getBusyCopy(phase: WorkflowPhase) {
  switch (phase) {
    case "preflight-scanning":
      return "Analyzing metadata and local pixel signals...";
    case "processing":
      return "Processing in progress...";
    case "postflight-scanning":
      return "Verifying processed JPEG...";
    default:
      return "Working...";
  }
}

function getPhaseTitle(phase: WorkflowPhase) {
  switch (phase) {
    case "idle":
      return "Ready";
    case "preflight-scanning":
      return "Analyzing";
    case "analysis-only":
      return "Analysis only";
    case "processing":
      return "Removing watermarks";
    case "postflight-scanning":
      return "Verifying";
    case "complete":
      return "Complete";
    case "error":
      return "Needs attention";
    case "cancelled":
      return "Cancelled";
  }
}

function getPhaseDescription(phase: WorkflowPhase) {
  switch (phase) {
    case "idle":
      return "Upload an image to start the local audit and automatic workflow.";
    case "preflight-scanning":
      return "Reading metadata and checking for visible Gemini-style marks.";
    case "analysis-only":
      return "This file can be analyzed, but it is not processable by the browser canvas pipeline.";
    case "processing":
      return "The local shake, stir, crush, and visible-restore steps are running.";
    case "postflight-scanning":
      return "The generated JPEG is being scanned again for before/after verification.";
    case "complete":
      return "The processed JPEG is ready and the verification diff is available.";
    case "error":
      return "The workflow stopped before producing a verified JPEG.";
    case "cancelled":
      return "The current run was cancelled. Reset or retry to continue.";
  }
}
