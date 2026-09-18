import { describe, expect, it, vi } from "vitest";
import { BatchQueue, uniqueOutputName, type ImageProcessor } from "./queue";
import { buildImageAudit } from "@/lib/imageAudit";
import type { ImageEngineResult } from "@/lib/engine/types";
import type { ImageEngineControls } from "@/lib/engine/types";
import { DEFAULT_OPTIONS } from "@/lib/pipeline";
const file = (name = "image.png") =>
  new File(["test"], name, { type: "image/png" });
const result = (bytes = 1) =>
  ({
    output: new Blob(["x".repeat(bytes)]),
    outputName: "engine.jpg",
    outcome: "completed",
    warnings: [],
    canCleanMetadata: false,
    preflight: buildImageAudit({ stage: "preflight", metadataScan: null }),
    postflight: null,
  }) as ImageEngineResult;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
describe("sequential batch", () => {
  it("keeps the whole job sequential and isolates errors", async () => {
    let active = 0;
    let peak = 0;
    const process: ImageProcessor = async (input) => {
      active++;
      peak = Math.max(peak, active);
      await tick();
      active--;
      if (input.name === "broken.png") throw Error();
      return result();
    };
    const queue = new BatchQueue(process);
    queue.add([file(), file("broken.png"), file()], DEFAULT_OPTIONS);
    await vi.waitFor(() =>
      expect(queue.getSnapshot().items.map((item) => item.status)).toEqual([
        "completed",
        "failed",
        "completed",
      ]),
    );
    expect(peak).toBe(1);
    expect(
      new Set(queue.getSnapshot().items.map((item) => item.outputName)).size,
    ).toBe(3);
  });
  it("pauses after the active job, cancels stale callbacks, retries from original", async () => {
    const pending: Array<() => void> = [];
    const seen: File[] = [];
    const process: ImageProcessor = (input, _options, controls) => {
      seen.push(input);
      return new Promise((resolve) =>
        pending.push(() => {
          controls.onProgress?.({ phase: "complete", steps: [] });
          resolve(result());
        }),
      );
    };
    const queue = new BatchQueue(process);
    const original = file();
    queue.add([original, file()], DEFAULT_OPTIONS);
    await tick();
    queue.pause();
    pending.shift()!();
    await tick();
    expect(queue.getSnapshot().items[1].status).toBe("waiting");
    queue.resume();
    await tick();
    queue.cancel("2");
    queue.retry("2");
    pending.shift()!();
    await tick();
    expect(queue.getSnapshot().items[1].result).toBeNull();
    expect(queue.getSnapshot().items[1].status).toBe("running");
    pending.shift()!();
    await tick();
    expect(seen[1]).toBe(seen[2]);
    expect(queue.getSnapshot().items[1].status).toBe("completed");
  });
  it("enforces admission and output budgets without losing completed outputs", async () => {
    const queue = new BatchQueue(async () => result(3), {
      items: 2,
      inputBytes: 100,
      outputBytes: 4,
    });
    queue.add([file(), file(), file()], DEFAULT_OPTIONS);
    expect(queue.getSnapshot().notice?.key).toBe(
      "workflow:batch.admissionLimit",
    );
    await vi.waitFor(() => expect(queue.getSnapshot().paused).toBe(true));
    expect(queue.getSnapshot().items.map((item) => item.status)).toEqual([
      "completed",
      "failed",
    ]);
    expect(queue.getSnapshot().items[0].result?.output?.size).toBe(3);
    queue.remove("1");
    queue.retry("2");
    queue.resume();
    await vi.waitFor(() =>
      expect(queue.getSnapshot().items[0].status).toBe("completed"),
    );
  });
  it("rejects unsupported files individually and freezes options", async () => {
    const queue = new BatchQueue(async () => result());
    queue.pause();
    const options = structuredClone(DEFAULT_OPTIONS);
    queue.add(
      [new File(["x"], "bad.txt", { type: "text/plain" }), file()],
      options,
    );
    options.crush!.quality = 0.1;
    expect(queue.getSnapshot().items[0].status).toBe("rejected");
    expect(queue.getSnapshot().items[1].options.crush?.quality).toBe(
      DEFAULT_OPTIONS.crush?.quality,
    );
    queue.cancelAll();
    expect(queue.getSnapshot().items[1].status).toBe("cancelled");
    queue.dispose();
  });
  it("creates safe case-insensitive archive names", () => {
    const reserved = new Set<string>();
    expect(uniqueOutputName("../Photo.png", reserved)).toBe(
      "_Photo-unmarker.jpg",
    );
    expect(uniqueOutputName("PHOTO.png", reserved)).toBe("PHOTO-unmarker.jpg");
    expect(uniqueOutputName("photo.jpg", reserved)).toBe(
      "photo-unmarker-2.jpg",
    );
  });
  it("ignores late progress and completion from a removed active image, then continues", async () => {
    const pending: Array<{
      controls: ImageEngineControls;
      resolve: (value: ImageEngineResult) => void;
    }> = [];
    const process: ImageProcessor = (_file, _options, controls) =>
      new Promise((resolve) => {
        pending.push({ controls, resolve });
      });
    const queue = new BatchQueue(process);
    queue.add([file("removed.png"), file("remaining.png")], DEFAULT_OPTIONS);
    await tick();
    const removed = pending[0];
    queue.remove("1");
    expect(removed.controls.signal?.aborted).toBe(true);
    removed.controls.onProgress?.({ phase: "complete", steps: [] });
    removed.resolve(result(50));
    await tick();
    expect(queue.getSnapshot().items).toHaveLength(1);
    expect(queue.getSnapshot().items[0]).toMatchObject({
      id: "2",
      status: "running",
      result: null,
      progress: null,
    });
    expect(queue.getSnapshot().activeId).toBe("2");
    expect(pending).toHaveLength(2);
    pending[1].resolve(result(2));
    await tick();
    expect(queue.getSnapshot().items[0].result?.output?.size).toBe(2);
    expect(queue.getSnapshot().items[0].status).toBe("completed");
    expect(queue.getSnapshot().activeId).toBeNull();
    queue.dispose();
  });

  it("disposes an active job and pending items without starting work or notifying later", async () => {
    let controls!: ImageEngineControls;
    let resolve!: (value: ImageEngineResult) => void;
    const process = vi.fn<ImageProcessor>(
      (_file, _options, currentControls) => {
        controls = currentControls;
        return new Promise((finish) => {
          resolve = finish;
        });
      },
    );
    const queue = new BatchQueue(process);
    const subscriber = vi.fn();
    queue.subscribe(subscriber);
    queue.add([file(), file("pending.png")], DEFAULT_OPTIONS);
    await tick();
    queue.dispose();
    const notifications = subscriber.mock.calls.length;
    expect(controls.signal?.aborted).toBe(true);
    controls.onProgress?.({ phase: "complete", steps: [] });
    resolve(result());
    await tick();
    queue.resume();
    queue.add([file("after-disposal.png")], DEFAULT_OPTIONS);
    expect(process).toHaveBeenCalledOnce();
    expect(subscriber).toHaveBeenCalledTimes(notifications);
    expect(queue.getSnapshot()).toMatchObject({
      items: [],
      activeId: null,
      paused: true,
    });
  });
});
