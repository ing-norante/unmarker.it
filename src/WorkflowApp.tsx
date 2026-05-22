import { useEffect, useRef, useState } from "react";
import { ThemeProvider } from "next-themes";
import { ImageUploader } from "@/components/ImageUploader";
import { CrushQualityControl } from "@/components/CrushQualityControl";
import { PipelineSteps } from "@/components/PipelineSteps";
import { Header } from "@/components/Header";
import { ActionBar } from "@/components/ActionBar";
import { ImageComparison } from "@/components/ImageComparison";
import { HomepageFacts } from "@/components/HomepageFacts";
import { DeferredFooter } from "@/components/DeferredFooter";
import {
  FilePolicyDetails,
  WorkflowSummary,
} from "@/components/WorkflowStatus";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { getWorkflowFilePolicy } from "@/lib/fileValidation";
import { getBusyCopy } from "@/lib/workflowCopy";
import { useImageWorkflow } from "@/hooks/useImageWorkflow";
import type { StatusMessage } from "@/lib/types";

interface WorkflowAppProps {
  initialFile: File;
  onResetToShell: () => void;
}

function WorkflowApp({ initialFile, onResetToShell }: WorkflowAppProps) {
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(
    null,
  );
  const selectedInitialFileRef = useRef<File | null>(null);
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

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled || selectedInitialFileRef.current === initialFile) {
        return;
      }

      selectedInitialFileRef.current = initialFile;
      selectImage(initialFile);
    });

    return () => {
      cancelled = true;
    };
  }, [initialFile, selectImage]);

  const handleReset = () => {
    reset();
    onResetToShell();
  };

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="theme"
    >
      <WorkflowLayout
        statusMessage={statusMessage}
        originalImage={originalImage}
        originalImageUrl={originalImageUrl}
        processedImageUrl={processedImageUrl}
        processedFileName={processedFileName}
        isProcessing={isProcessing}
        isMetadataCleaning={isMetadataCleaning}
        workflowWarnings={workflowWarnings}
        crushQuality={crushQuality}
        setCrushQuality={setCrushQuality}
        steps={steps}
        state={state}
        filePolicy={filePolicy}
        canvasRef={canvasRef}
        showCrushQuality={showCrushQuality}
        workflowBusy={workflowBusy}
        selectImage={selectImage}
        reset={handleReset}
        cancel={cancel}
        retry={retry}
        reprocess={reprocess}
        downloadMetadataClean={downloadMetadataClean}
      />
      <Toaster />
    </ThemeProvider>
  );
}

export default WorkflowApp;

function WorkflowLayout({
  statusMessage,
  originalImage,
  originalImageUrl,
  processedImageUrl,
  processedFileName,
  isProcessing,
  isMetadataCleaning,
  workflowWarnings,
  crushQuality,
  setCrushQuality,
  steps,
  state,
  filePolicy,
  canvasRef,
  showCrushQuality,
  workflowBusy,
  selectImage,
  reset,
  cancel,
  retry,
  reprocess,
  downloadMetadataClean,
}: {
  statusMessage: StatusMessage | null;
  originalImage: File | null;
  originalImageUrl: string | null;
  processedImageUrl: string | null;
  processedFileName: string | null;
  isProcessing: boolean;
  isMetadataCleaning: boolean;
  workflowWarnings: string[];
  crushQuality: number;
  setCrushQuality: (value: number) => void;
  steps: ReturnType<typeof useImageWorkflow>["steps"];
  state: ReturnType<typeof useImageWorkflow>["state"];
  filePolicy: ReturnType<typeof getWorkflowFilePolicy>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  showCrushQuality: boolean;
  workflowBusy: boolean;
  selectImage: (file: File) => void;
  reset: () => void;
  cancel: () => void;
  retry: () => void;
  reprocess: () => void;
  downloadMetadataClean: () => void;
}) {
  return (
    <div className="bg-background text-foreground selection:bg-primary selection:text-primary-foreground flex min-h-dvh p-0 font-sans">
      <div className="bg-background flex min-h-dvh w-full flex-col overflow-x-clip">
        <div className="relative flex flex-col px-(--page-gutter) py-8 lg:min-h-0 lg:py-10 2xl:py-12">
          <main
            role="main"
            className="wide-display-grid relative z-10 grid w-full grid-cols-1 content-start gap-8 lg:min-h-0 lg:grid-cols-[minmax(28rem,42%)_minmax(0,1fr)] lg:items-start lg:gap-x-10 xl:grid-cols-[minmax(34rem,45%)_minmax(0,1fr)] xl:gap-x-12 2xl:gap-x-16"
          >
            <div className="contents lg:col-start-1 lg:flex lg:min-h-0 lg:flex-col lg:gap-4">
              <Header className="order-1 shrink-0 lg:order-0" />

              <aside className="order-3 flex min-h-0 flex-col gap-4 lg:order-0 lg:flex-1">
                <div className="flex items-center gap-4">
                  <h2 className="text-muted-foreground shrink-0 text-base font-black sm:text-lg 2xl:text-xl">
                    WORKFLOW
                  </h2>
                  <Separator className="flex-1" />
                </div>

                <div className="min-h-0 flex-1 overflow-auto lg:overscroll-contain">
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
                </div>
              </aside>
            </div>

            <section
              className={cn(
                "order-2 flex min-w-0 flex-col lg:col-start-2 lg:min-h-0",
                !originalImage && "sticky-uploader-column",
              )}
            >
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
                <div className="flex min-h-[min(62vh,50rem)] flex-col lg:min-h-[min(70vh,50rem)] lg:flex-1 2xl:min-h-[min(72vh,56rem)]">
                  <ImageUploader
                    onImageSelect={selectImage}
                    accept={filePolicy.accept}
                    title="Drag an image"
                    description={
                      "Drop it here to analyze local AI signals, then remove watermarks automatically when processing is available."
                    }
                    details={<FilePolicyDetails policy={filePolicy} />}
                    className="min-h-[min(62vh,50rem)] flex-1 lg:min-h-[min(70vh,50rem)] 2xl:min-h-[min(72vh,56rem)]"
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

                  <div className="lg:min-h-0 lg:flex-1 lg:overflow-auto lg:overscroll-contain">
                    <ImageComparison
                      originalImageUrl={originalImageUrl}
                      processedImageUrl={processedImageUrl}
                      phase={state.phase}
                      preflightAudit={state.preflightAudit}
                      postflightAudit={state.postflightAudit}
                      workflowWarnings={workflowWarnings}
                    />
                  </div>
                </div>
              )}

              <canvas ref={canvasRef} className="hidden" />
            </section>
          </main>
        </div>
        <div className="px-(--page-gutter) pb-8">
          <HomepageFacts />
        </div>
        <div className="px-(--page-gutter) pb-6 lg:pb-8">
          <DeferredFooter />
        </div>
      </div>
    </div>
  );
}
