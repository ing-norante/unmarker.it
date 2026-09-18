import { CookieConsent } from "@/components/CookieConsent";
import { Suspense, useCallback, useState } from "react";
import { ImageUploader } from "@/components/ImageUploader";
import { Header } from "@/components/Header";
import { HomepageFacts } from "@/components/HomepageFacts";
import { Footer } from "@/components/Footer";
import { ChunkErrorBoundary } from "@/components/ChunkErrorBoundary";
import { ChunkReloadNotice } from "@/components/ChunkReloadNotice";
import { lazyWithReload } from "@/lib/lazyWithReload";
import {
  FilePolicyDetails,
  WorkflowSummary,
} from "@/components/WorkflowStatus";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getWorkflowFilePolicy } from "@/lib/fileValidation";
import { useTranslation } from "react-i18next";
import { LocaleSuggestion } from "@/components/LocaleSuggestion";
import { SponsorLayout } from "@/components/SponsorLayout";

const WorkflowApp = lazyWithReload(
  "workflow-app",
  () => import("@/WorkflowApp"),
);

function App() {
  return (
    <>
      <SponsorLayout>
        <AppContent />
      </SponsorLayout>
      <CookieConsent />
    </>
  );
}

function AppContent() {
  const { t } = useTranslation(["homepage", "workflow"]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [focusUploader, setFocusUploader] = useState(false);
  const filePolicy = getWorkflowFilePolicy();
  const selectImages = useCallback((files: File[]) => {
    setFocusUploader(false);
    setSelectedFiles(files);
  }, []);

  if (selectedFiles.length) {
    return (
      <ChunkErrorBoundary fallback={<ChunkReloadNotice />}>
        <Suspense fallback={<LoadingShell fileName={selectedFiles[0].name} />}>
          <WorkflowApp
            initialFiles={selectedFiles}
            onResetToShell={() => {
              setFocusUploader(true);
              setSelectedFiles([]);
            }}
          />
        </Suspense>
      </ChunkErrorBoundary>
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
                    {t("homepage:workflowHeading")}
                  </h2>
                  <Separator className="flex-1" />
                </div>

                <WorkflowSummary phase="idle" />
              </aside>
            </div>

            <section className="sticky-uploader-column order-2 flex min-w-0 flex-col lg:col-start-2 lg:min-h-0">
              <div className="flex min-h-[min(62vh,50rem)] flex-col lg:min-h-[min(70vh,50rem)] lg:flex-1 2xl:min-h-[min(72vh,56rem)]">
                <ImageUploader
                  autoFocus={focusUploader}
                  onImagesSelect={selectImages}
                  accept={filePolicy.accept}
                  title={t("homepage:uploader.title")}
                  description={t("homepage:uploader.description")}
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
          <Footer />
        </div>
        <div translate="no">
          <LocaleSuggestion />
        </div>
      </div>
    </div>
  );
}

export default App;

function LoadingShell({ fileName }: { fileName: string }) {
  const { t } = useTranslation(["homepage", "workflow"]);
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
                    {t("homepage:workflowHeading")}
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
                    {t("homepage:loading.preparing", { fileName })}
                  </p>
                  <p className="text-muted-foreground text-sm font-medium sm:text-base">
                    {t("homepage:loading.description")}
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
