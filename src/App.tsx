import { lazy, Suspense, useCallback, useState } from "react";
import { ImageUploader } from "@/components/ImageUploader";
import { Header } from "@/components/Header";
import { HomepageFacts } from "@/components/HomepageFacts";
import { DeferredFooter } from "@/components/DeferredFooter";
import {
  FilePolicyDetails,
  WorkflowSummary,
} from "@/components/WorkflowStatus";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getWorkflowFilePolicy,
  validateWorkflowFile,
} from "@/lib/fileValidation";
import type { StatusMessage } from "@/lib/types";

const WorkflowApp = lazy(() => import("@/WorkflowApp"));

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(
    null,
  );
  const filePolicy = getWorkflowFilePolicy();

  const selectImage = useCallback((file: File) => {
    const validation = validateWorkflowFile(file);
    if (!validation.ok) {
      setStatusMessage(validation.statusMessage);
      return;
    }

    setStatusMessage(null);
    setSelectedFile(file);
  }, []);

  if (selectedFile) {
    return (
      <Suspense fallback={<LoadingShell fileName={selectedFile.name} />}>
        <WorkflowApp
          key={`${selectedFile.name}:${selectedFile.size}:${selectedFile.lastModified}`}
          initialFile={selectedFile}
          onResetToShell={() => setSelectedFile(null)}
        />
      </Suspense>
    );
  }

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

                <WorkflowSummary phase="idle" />
              </aside>
            </div>

            <section className="sticky-uploader-column order-2 flex min-w-0 flex-col lg:col-start-2 lg:min-h-0">
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

export default App;

function LoadingShell({ fileName }: { fileName: string }) {
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
                <WorkflowSummary phase="preflight-scanning" />
              </aside>
            </div>

            <section className="order-2 flex min-w-0 flex-col lg:col-start-2 lg:min-h-0">
              <div className="bg-card text-card-foreground flex min-h-[min(62vh,50rem)] flex-col justify-center gap-4 border p-6 lg:min-h-[min(70vh,50rem)]">
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="text-foreground truncate text-xl leading-tight font-black sm:text-2xl">
                    Preparing {fileName}
                  </p>
                  <p className="text-muted-foreground text-sm font-medium sm:text-base">
                    Loading the local image workflow...
                  </p>
                </div>
                <Skeleton className="h-1 w-full" />
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
