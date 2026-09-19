import { CookieConsent } from "@/components/CookieConsent";
import { Suspense, useCallback, useState } from "react";
import { ImageUploader } from "@/components/ImageUploader";
import { Header } from "@/components/Header";
import { HomepageFacts } from "@/components/HomepageFacts";
import { ChunkErrorBoundary } from "@/components/ChunkErrorBoundary";
import { ChunkReloadNotice } from "@/components/ChunkReloadNotice";
import { lazyWithReload } from "@/lib/lazyWithReload";
import {
  FilePolicyDetails,
  WorkflowSummary,
} from "@/components/WorkflowStatus";
import { WorkspaceFrame } from "@/components/WorkspaceFrame";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getWorkflowFilePolicy } from "@/lib/fileValidation";
import { useTranslation } from "react-i18next";
import { SponsorLayout } from "@/components/SponsorLayout";
import type { WorkflowPhase } from "@/lib/types";

const WorkflowApp = lazyWithReload(
  "workflow-app",
  () => import("@/WorkflowApp"),
);

export default function App() {
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
  const { t } = useTranslation("homepage");
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
    <WorkspaceFrame below={<HomepageFacts />}>
      <ShellIntroduction phase="idle" />
      <section className="sticky-uploader-column order-2 flex min-w-0 flex-col lg:col-start-2 lg:min-h-0">
        <div className="flex min-h-[min(62vh,50rem)] flex-col lg:min-h-[min(70vh,50rem)] lg:flex-1 2xl:min-h-[min(72vh,56rem)]">
          <ImageUploader
            autoFocus={focusUploader}
            onImagesSelect={selectImages}
            accept={filePolicy.accept}
            title={t("uploader.title")}
            description={t("uploader.description")}
            details={<FilePolicyDetails policy={filePolicy} />}
            className="min-h-[min(62vh,50rem)] flex-1 lg:min-h-[min(70vh,50rem)] 2xl:min-h-[min(72vh,56rem)]"
          />
        </div>
      </section>
    </WorkspaceFrame>
  );
}

function ShellIntroduction({ phase }: { phase: WorkflowPhase }) {
  const { t } = useTranslation("homepage");
  return (
    <div className="contents lg:col-start-1 lg:flex lg:min-h-0 lg:flex-col lg:gap-4">
      <Header className="order-1 shrink-0 lg:order-0" />
      <aside className="order-3 flex min-h-0 flex-col gap-4 lg:order-0 lg:flex-1">
        <div className="flex items-center gap-4">
          <h2 className="text-muted-foreground shrink-0 text-base font-black sm:text-lg 2xl:text-xl">
            {t("workflowHeading")}
          </h2>
          <Separator className="flex-1" />
        </div>
        <WorkflowSummary phase={phase} />
      </aside>
    </div>
  );
}

function LoadingShell({ fileName }: { fileName: string }) {
  const { t } = useTranslation("homepage");
  return (
    <WorkspaceFrame footer={false}>
      <ShellIntroduction phase="preflight-scanning" />
      <section className="order-2 flex min-w-0 flex-col lg:col-start-2 lg:min-h-0">
        <div className="bg-card text-card-foreground flex min-h-[min(62vh,50rem)] flex-col justify-center gap-4 border p-6 lg:min-h-[min(70vh,50rem)]">
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-foreground truncate text-xl leading-tight font-black sm:text-2xl">
              {t("loading.preparing", { fileName })}
            </p>
            <p className="text-muted-foreground text-sm font-medium sm:text-base">
              {t("loading.description")}
            </p>
          </div>
          <Skeleton className="h-1 w-full" />
        </div>
      </section>
    </WorkspaceFrame>
  );
}
