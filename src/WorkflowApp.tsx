import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LocaleSuggestion } from "@/components/LocaleSuggestion";
import { BatchQueuePanel } from "@/components/BatchQueuePanel";
import { BatchResult } from "@/components/BatchResult";
import { CrushQualityControl } from "@/components/CrushQualityControl";
import { Button } from "@/components/ui/button";
import { useBatchQueue } from "@/hooks/useBatchQueue";
import { DEFAULT_OPTIONS } from "@/lib/pipeline";
import { exportBatch } from "@/lib/batch/export";
import { trackAction } from "@/lib/analytics";
import { downloadBlob } from "@/lib/downloadBlob";

export default function WorkflowApp({
  initialFiles,
  onResetToShell,
}: {
  initialFiles: File[];
  onResetToShell: () => void;
}) {
  const { t } = useTranslation("workflow");
  const { queue, snapshot } = useBatchQueue(initialFiles);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quality, setQuality] = useState(DEFAULT_OPTIONS.crush!.quality);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const exportController = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      exportController.current?.abort();
      exportController.current = null;
    },
    [],
  );
  const selected =
    snapshot.items.find((item) => item.id === selectedId) ?? snapshot.items[0];
  const options = {
    ...DEFAULT_OPTIONS,
    crush: { ...DEFAULT_OPTIONS.crush, quality },
  };
  const ready = snapshot.items.filter((item) => item.result?.output).length;
  const pending = snapshot.items.some(
    (item) => item.status === "waiting" || item.status === "running",
  );
  const downloadArchive = async () => {
    const controller = new AbortController();
    exportController.current = controller;
    const wasPaused = queue.getSnapshot().paused;
    queue.pause();
    setExporting(true);
    setNotice("");
    try {
      const blob = await exportBatch(snapshot.items, controller.signal);
      if (!controller.signal.aborted) {
        downloadBlob(blob, "unmarker-images.zip");
        setNotice(t("batch.downloadStarted"));
      }
    } catch {
      if (!controller.signal.aborted) setNotice(t("batch.exportFailed"));
    } finally {
      if (exportController.current === controller) {
        exportController.current = null;
        setExporting(false);
        if (!wasPaused) queue.resume();
      }
    }
  };
  return (
    <div className="bg-background text-foreground selection:bg-primary selection:text-primary-foreground flex min-h-dvh flex-col font-sans">
      <main className="wide-display-grid grid min-w-0 grid-cols-1 items-start gap-8 px-(--page-gutter) py-8 lg:grid-cols-[minmax(28rem,42%)_minmax(0,1fr)] lg:gap-x-10 lg:py-10 xl:grid-cols-[minmax(34rem,45%)_minmax(0,1fr)] xl:gap-x-12">
        <div className="flex min-w-0 flex-col gap-6">
          <Header />
          <div className="min-w-0">
            <BatchQueuePanel
              queue={queue}
              snapshot={snapshot}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
              onAdd={(files) => {
                trackAction("upload_image", "uploader", {
                  file_count: files.length,
                });
                queue.add(files, options);
              }}
              locked={exporting}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-3 border-t pt-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!ready || !!snapshot.activeId || exporting}
                  onClick={downloadArchive}
                >
                  {t(exporting ? "batch.exporting" : "batch.zip", {
                    count: ready,
                  })}
                </Button>
                {exporting && (
                  <Button
                    variant="outline"
                    onClick={() => exportController.current?.abort()}
                  >
                    {t("batch.cancelExport")}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  disabled={pending || exporting}
                  onClick={() => {
                    trackAction("reset", "action_bar");
                    onResetToShell();
                  }}
                >
                  {t("batch.clear")}
                </Button>
              </div>
              <p className="text-muted-foreground text-sm">
                {t("batch.exportHelp")}
              </p>
              {notice && (
                <p role="status" className="text-primary-text text-sm">
                  {notice}
                </p>
              )}
            </div>
            <div>
              <CrushQualityControl
                value={quality}
                onChange={setQuality}
                disabled={exporting}
              />
              <p className="text-muted-foreground mt-2 text-sm">
                {t("batch.qualityHelp")}
              </p>
            </div>
          </div>
        </div>
        {selected && (
          <div className="min-w-0">
            <BatchResult
              key={selected.id}
              item={selected}
              queue={queue}
              options={options}
              locked={exporting}
            />
          </div>
        )}
      </main>
      <div className="mt-auto px-(--page-gutter) pb-8">
        <Footer />
      </div>
      <div translate="no">
        <LocaleSuggestion />
      </div>
    </div>
  );
}
