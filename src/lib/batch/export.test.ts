import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildImageAudit } from "@/lib/imageAudit";
import type { BatchItem } from "./queue";
import { exportBatch } from "./export";

type WorkerReply = { bytes?: Uint8Array; final?: boolean; error?: boolean };
const workers: ExportWorker[] = [];
class ExportWorker {
  static dispatchFails = false;
  onmessage: ((event: MessageEvent<WorkerReply>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn(() => {
    if (ExportWorker.dispatchFails)
      throw new Error("Worker could not clone message");
  });
  constructor() {
    workers.push(this);
  }
  emit(data: WorkerReply) {
    this.onmessage?.({ data } as MessageEvent<WorkerReply>);
  }
}

function items(): BatchItem[] {
  return [
    {
      id: "1",
      attempt: 0,
      file: new File(["original"], "photo.png", { type: "image/png" }),
      options: {},
      status: "completed",
      progress: null,
      error: null,
      outputName: "photo-unmarker.jpg",
      result: {
        output: new Blob(["jpeg"]),
        outputName: "engine.jpg",
        outcome: "completed",
        warnings: [],
        canCleanMetadata: false,
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
      },
    },
  ];
}

describe("batch export worker lifecycle", () => {
  beforeEach(() => {
    workers.length = 0;
    ExportWorker.dispatchFails = false;
    vi.stubGlobal("Worker", ExportWorker);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("cleans up the worker, timer, and abort listener when dispatch throws", async () => {
    ExportWorker.dispatchFails = true;
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await expect(exportBatch(items(), controller.signal)).rejects.toThrow(
      "Archive dispatch failed",
    );
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("discards buffered chunks on cancellation and ignores a late final response", async () => {
    const controller = new AbortController();
    const pending = exportBatch(items(), controller.signal);
    expect(workers[0].postMessage).toHaveBeenCalledWith({
      entries: [{ name: "photo-unmarker.jpg", blob: expect.any(Blob) }],
      report: {
        version: 1,
        scope: expect.any(String),
        images: [
          {
            name: "photo.png",
            status: "completed",
            output: "photo-unmarker.jpg",
            warnings: [],
            error: null,
            checks: {
              before: expect.objectContaining({
                visibleMark: "not-scanned",
                hiddenMark: "unverified",
              }),
              after: expect.objectContaining({
                visibleMark: "not-scanned",
                hiddenMark: "unverified",
              }),
            },
          },
        ],
      },
    });
    workers[0].emit({ bytes: new Uint8Array([1, 2]), final: false });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    const NativeBlob = Blob;
    const allocated = vi.fn();
    vi.stubGlobal(
      "Blob",
      class extends NativeBlob {
        constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          allocated();
        }
      },
    );
    workers[0].emit({ bytes: new Uint8Array([3, 4]), final: true });
    expect(allocated).not.toHaveBeenCalled();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("assembles the successful chunks into the final ZIP and releases its worker", async () => {
    const controller = new AbortController();
    const pending = exportBatch(items(), controller.signal);
    workers[0].emit({ bytes: new Uint8Array([80, 75]), final: false });
    workers[0].emit({ bytes: new Uint8Array([3, 4]), final: true });
    const blob = await pending;
    expect(blob.type).toBe("application/zip");
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([
      80, 75, 3, 4,
    ]);
    controller.abort();
    workers[0].emit({ error: true });
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["error", "messageerror", "reported-error"] as const)(
    "rejects %s after partial output and cleans up",
    async (kind) => {
      const pending = exportBatch(items());
      workers[0].emit({ bytes: new Uint8Array([80, 75]), final: false });
      if (kind === "error") workers[0].onerror?.();
      else if (kind === "messageerror") workers[0].onmessageerror?.();
      else workers[0].emit({ error: true });
      await expect(pending).rejects.toThrow(/Archive/);
      workers[0].emit({ bytes: new Uint8Array([3, 4]), final: true });
      expect(workers[0].terminate).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("terminates a stalled export when its deadline expires", async () => {
    const pending = exportBatch(items());
    const rejected = expect(pending).rejects.toThrow("Archive timed out");
    await vi.advanceTimersByTimeAsync(120_000);
    await rejected;
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    null,
    {},
    { bytes: "invalid", final: true },
    { bytes: new Uint8Array([1]) },
  ])("rejects malformed archive messages: %j", async (response) => {
    const pending = exportBatch(items());
    workers[0].emit(response as WorkerReply);
    await expect(pending).rejects.toThrow("invalid response");
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("includes only the owned bytes of an incoming view", async () => {
    const pending = exportBatch(items());
    workers[0].emit({
      bytes: new Uint8Array([99, 80, 75, 99]).subarray(1, 3),
      final: true,
    });
    const output = await pending;
    expect(Array.from(new Uint8Array(await output.arrayBuffer()))).toEqual([
      80, 75,
    ]);
  });
});
