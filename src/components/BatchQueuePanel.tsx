import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { PlusIcon, XIcon, PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { WORKFLOW_ACCEPT } from "@/lib/fileValidation";
import { cn } from "@/lib/utils";
import type { BatchQueue, BatchSnapshot } from "@/lib/batch/queue";
import { presentBatch, presentBatchItem } from "@/lib/workflow/presentation";
import { translateMessage } from "@/i18n/messages";

export function BatchQueuePanel({
  snapshot,
  queue,
  selectedId,
  onSelect,
  onAdd,
  locked,
}: {
  snapshot: BatchSnapshot;
  queue: BatchQueue;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (files: File[]) => void;
  locked: boolean;
}) {
  const { t } = useTranslation("workflow");
  const input = useRef<HTMLInputElement>(null);
  const { active, finished, outputBytes, canToggleQueue } =
    presentBatch(snapshot);
  return (
    <section className="min-w-0" aria-labelledby="queue-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="queue-heading" className="text-xl font-black">
          {t("batch.title")}
        </h2>
        <Button
          variant="outline"
          onClick={() => input.current?.click()}
          disabled={locked}
        >
          <PlusIcon />
          {t("batch.add")}
        </Button>
        <input
          ref={input}
          type="file"
          disabled={locked}
          className="hidden"
          multiple
          accept={WORKFLOW_ACCEPT}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            if (files.length && !locked) onAdd(files);
          }}
        />
      </div>
      <div
        role="status"
        aria-live="polite"
        className="text-muted-foreground mb-3 text-sm"
      >
        <p className="text-foreground font-bold tabular-nums">
          {t("batch.summary", { done: finished, total: snapshot.items.length })}
        </p>
        <p className="wrap-anywhere">
          {active
            ? t("batch.active", { name: active.file.name })
            : t(snapshot.paused ? "batch.paused" : "batch.idle")}
        </p>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={!canToggleQueue}
          onClick={snapshot.paused ? queue.resume : queue.pause}
        >
          {snapshot.paused ? <PlayIcon /> : <PauseIcon />}
          {t(snapshot.paused ? "batch.resume" : "batch.pause")}
        </Button>
        <Button
          variant="ghost"
          disabled={!canToggleQueue}
          onClick={queue.cancelAll}
        >
          {t("batch.cancelAll")}
        </Button>
      </div>
      <p className="text-muted-foreground mb-4 text-sm">
        {t("batch.pauseHelp")}
      </p>
      {snapshot.notice && (
        <p
          role="alert"
          className="text-destructive-text mb-4 border p-3 text-sm"
        >
          {translateMessage(t, snapshot.notice)}
        </p>
      )}
      {!snapshot.items.length && (
        <p className="border p-4">{t("batch.empty")}</p>
      )}
      <ol className="max-h-96 overflow-y-auto border-y">
        {snapshot.items.map((item) => (
          <li
            key={item.id}
            className={cn(
              "flex min-w-0 items-center border-b last:border-b-0",
              item.id === selectedId && "bg-primary/15",
            )}
          >
            <button
              type="button"
              aria-pressed={item.id === selectedId}
              aria-label={t("batch.select", { name: item.file.name })}
              onClick={() => onSelect(item.id)}
              className="focus-visible:outline-primary-text hover:bg-muted/50 flex min-h-16 min-w-0 flex-1 flex-col items-start gap-1 p-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2"
            >
              <span className="w-full truncate font-bold">
                {item.file.name}
              </span>
              <Badge variant={presentBatchItem(item).badge}>
                {item.status === "running" && <Spinner />}
                {translateMessage(t, presentBatchItem(item).status)}
              </Badge>
            </button>
            <Button
              variant="ghost"
              className="m-1 min-h-11 min-w-11 shrink-0"
              disabled={locked}
              aria-label={t("batch.remove", { name: item.file.name })}
              onClick={() => queue.remove(item.id)}
            >
              <XIcon />
            </Button>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground mt-3 text-sm">{t("batch.limits")}</p>
      <p className="text-muted-foreground text-sm tabular-nums">
        {t("batch.memory", {
          mb: (outputBytes / 1024 ** 2).toFixed(1),
        })}
      </p>
    </section>
  );
}
