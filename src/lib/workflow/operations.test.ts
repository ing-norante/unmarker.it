import { describe, expect, it, vi } from "vitest";
import { BatchQueue } from "@/lib/batch/queue";
import { DEFAULT_OPTIONS } from "@/lib/pipeline";
import { buildImageAudit } from "@/lib/imageAudit";
import type { ImageEngineProcessedResult } from "@/lib/engine/types";
import type { MetadataCleanResult } from "@/lib/types";
import {
  WorkflowOperations,
  type WorkflowOperationServices,
} from "./operations";
import { createI18n } from "@/i18n/createI18n";
import { translateMessage } from "@/i18n/messages";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const output: ImageEngineProcessedResult = {
  outcome: "completed",
  output: new Blob(["jpeg"]),
  outputName: "image.jpg",
  warnings: [],
  canCleanMetadata: true,
  preflight: buildImageAudit({
    stage: "preflight",
    metadataScan: null,
    visibleScan: { status: "not-scanned" },
  }),
  postflight: buildImageAudit({
    stage: "postflight",
    metadataScan: null,
    visibleScan: { status: "not-scanned" },
  }),
};
const clean: MetadataCleanResult = {
  blob: new Blob(["clean"]),
  fileName: "image-clean.png",
  format: "png",
  removedCount: 1,
  warnings: [],
};

async function setup() {
  const process = vi.fn(async () => output);
  const queue = new BatchQueue(process);
  queue.add(
    [new File(["image"], "image.png", { type: "image/png" })],
    DEFAULT_OPTIONS,
  );
  await vi.waitFor(() => expect(queue.getSnapshot().activeId).toBe(null));
  const services: WorkflowOperationServices = {
    cleanMetadata: vi.fn(async () => clean),
    exportArchive: vi.fn(async () => new Blob(["zip"])),
    download: vi.fn(),
    onMetadataDownload: vi.fn(),
  };
  return {
    queue,
    services,
    operations: new WorkflowOperations(queue, services),
    process,
    id: queue.getSnapshot().items[0].id,
  };
}

describe("workflow operations", () => {
  it("serializes metadata cleanup, archive export and queue mutations", async () => {
    const { queue, services, operations, id, process } = await setup();
    queue.pause();
    const pending = deferred<MetadataCleanResult>();
    services.cleanMetadata = vi.fn(() => pending.promise);
    const run = operations.cleanMetadata(id);
    expect(queue.getSnapshot().operationLocked).toBe(true);
    await operations.downloadArchive();
    await operations.cleanMetadata(id);
    queue.resume();
    queue.retry(id);
    queue.add(
      [new File(["other"], "other.png", { type: "image/png" })],
      DEFAULT_OPTIONS,
    );
    queue.remove(id);
    expect(services.cleanMetadata).toHaveBeenCalledTimes(1);
    expect(services.exportArchive).not.toHaveBeenCalled();
    expect(process).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot().items).toHaveLength(1);
    pending.resolve(clean);
    await run;
    expect(queue.getSnapshot().operationLocked).toBe(false);
    expect(queue.getSnapshot().paused).toBe(true);
    expect(services.download).toHaveBeenCalledWith(clean.blob, clean.fileName);
  });

  it("keeps the lease until cancelled cleanup settles and discards its late result", async () => {
    const { queue, services, operations, id } = await setup();
    const pending = deferred<MetadataCleanResult>();
    const read = vi.fn<WorkflowOperationServices["cleanMetadata"]>(
      () => pending.promise,
    );
    services.cleanMetadata = read;
    const run = operations.cleanMetadata(id);
    operations.cancel();
    expect(read.mock.calls[0][1].signal.aborted).toBe(true);
    expect(operations.getSnapshot().operation?.cancelling).toBe(true);
    expect(queue.getSnapshot().operationLocked).toBe(true);
    await operations.downloadArchive();
    expect(services.exportArchive).not.toHaveBeenCalled();
    pending.resolve(clean);
    await run;
    expect(services.download).not.toHaveBeenCalled();
    expect(operations.getSnapshot().itemNotice).toBe(null);
    expect(queue.getSnapshot().operationLocked).toBe(false);
    expect(queue.getSnapshot().paused).toBe(false);
  });

  it("aborts on unmount and safely tolerates effect stop/start replay", async () => {
    const { services, operations, id } = await setup();
    const pending = deferred<Blob>();
    const exportArchive = vi.fn<WorkflowOperationServices["exportArchive"]>(
      () => pending.promise,
    );
    services.exportArchive = exportArchive;
    const run = operations.downloadArchive();
    operations.stop();
    operations.start();
    expect(exportArchive.mock.calls[0][1].aborted).toBe(true);
    pending.resolve(new Blob(["late"]));
    await run;
    expect(services.download).not.toHaveBeenCalled();
    await operations.cleanMetadata(id);
    expect(services.download).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])(
    "releases failed export without changing paused=%s",
    async (paused) => {
      const { queue, services, operations } = await setup();
      if (paused) queue.pause();
      services.exportArchive = vi.fn(async () => {
        throw Error("zip failed");
      });
      await operations.downloadArchive();
      expect(queue.getSnapshot().paused).toBe(paused);
      expect(queue.getSnapshot().operationLocked).toBe(false);
      expect(operations.getSnapshot().archiveNotice).toEqual([
        { key: "workflow:batch.exportFailed" },
      ]);
    },
  );

  it("does not acquire a second heavy operation while an image job is active", async () => {
    const { queue, services, operations, id } = await setup();
    queue.retry(id);
    await operations.downloadArchive();
    await operations.cleanMetadata(id);
    expect(services.exportArchive).not.toHaveBeenCalled();
    expect(services.cleanMetadata).not.toHaveBeenCalled();
  });

  it("preserves a pause applied while exporting", async () => {
    const { queue, services, operations } = await setup();
    const pending = deferred<Blob>();
    services.exportArchive = () => pending.promise;
    const run = operations.downloadArchive();
    queue.pause();
    pending.resolve(new Blob(["zip"]));
    await run;
    expect(queue.getSnapshot().paused).toBe(true);
    expect(services.download).toHaveBeenCalledTimes(1);
  });

  it("translates settled notices and metadata warnings at render time", async () => {
    const { services, operations, id } = await setup();
    services.cleanMetadata = async () => ({
      ...clean,
      warnings: [{ code: "metadata-scan-limit" }],
    });
    await operations.cleanMetadata(id);
    const descriptors = operations.getSnapshot().itemNotice!.messages;
    const i18n = await createI18n("en");
    const english = descriptors.map((entry) => translateMessage(i18n.t, entry));
    await i18n.changeLanguage("zh-Hans");
    const chinese = descriptors.map((entry) => translateMessage(i18n.t, entry));
    expect(english).toEqual([
      "Download started. Check your browser downloads.",
      "Metadata inspection stopped at the local resource limit; the file was preserved.",
    ]);
    expect(chinese.every((text, index) => text !== english[index])).toBe(true);
    expect(
      chinese.every(
        (text) =>
          !text.startsWith("workflow:") && !text.startsWith("metadata:"),
      ),
    ).toBe(true);
  });

  it("keeps a successful download when optional telemetry throws", async () => {
    const { services, operations, id } = await setup();
    services.onMetadataDownload = () => {
      throw Error("analytics unavailable");
    };
    await operations.cleanMetadata(id);
    expect(services.download).toHaveBeenCalledTimes(1);
    expect(operations.getSnapshot().itemNotice?.messages[0].key).toBe(
      "workflow:batch.downloadStarted",
    );
  });
});
