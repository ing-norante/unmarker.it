import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessingCanvas } from "@/lib/canvas";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  create: vi.fn(),
  draw: vi.fn(),
  release: vi.fn(),
}));
vi.mock("@/lib/canvas", () => ({
  createProcessingCanvas: mocks.create,
  getProcessingContext: (canvas: unknown) => ({
    canvas,
    drawImage: mocks.draw,
  }),
  releaseCanvas: mocks.release,
}));
vi.mock("@/lib/pixelPipeline", () => ({ executePixelPipeline: mocks.execute }));
import { processPixels } from "./pixels";

const workers: PixelWorker[] = [];
class PixelWorker {
  static dispatchFails = false;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn(() => {
    if (PixelWorker.dispatchFails) throw new Error("dispatch failed");
  });
  constructor() {
    workers.push(this);
  }
  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }
}
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const source = () =>
  ({ width: 8, height: 8, pixels: "original" }) as unknown as ProcessingCanvas;
const output = new Blob(["jpeg"], { type: "image/jpeg" });

describe("pixel drivers", () => {
  let bitmap: { close: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    workers.length = 0;
    PixelWorker.dispatchFails = false;
    bitmap = { close: vi.fn() };
    vi.stubGlobal("Worker", PixelWorker);
    vi.stubGlobal("OffscreenCanvas", class {});
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => bitmap),
    );
    mocks.create.mockReturnValue({ width: 8, height: 8 });
    mocks.execute.mockImplementation(
      async (_source, _context, _options, controls) => {
        controls.onSourceConsumed?.();
        return output;
      },
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("settles a worker result and frees bitmap/worker exactly once", async () => {
    const fallback = vi.fn();
    const controller = new AbortController();
    const pending = processPixels(
      source(),
      {},
      { signal: controller.signal, onPhase: vi.fn(), onFallback: fallback },
    );
    await tick();
    workers[0].emit({ type: "done", output });
    await expect(pending).resolves.toBe(output);
    controller.abort();
    workers[0].emit({ type: "done", output });
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    null,
    { type: "done" },
    { type: "done", output: "not a Blob" },
    { type: "progress", phase: "unknown" },
  ])(
    "rejects malformed worker responses into fallback from the original canvas: %j",
    async (response) => {
      const canvas = source();
      const fallback = vi.fn();
      const pending = processPixels(
        canvas,
        {},
        { onPhase: vi.fn(), onFallback: fallback },
      );
      await tick();
      workers[0].emit(response);
      await expect(pending).resolves.toBe(output);
      expect(fallback).toHaveBeenCalledOnce();
      expect(mocks.draw).toHaveBeenCalledWith(canvas, 0, 0);
      expect(mocks.execute).toHaveBeenCalledOnce();
      expect(mocks.release).toHaveBeenCalledOnce();
      expect(workers[0].terminate).toHaveBeenCalledOnce();
      expect(bitmap.close).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("does not fall back after cancellation and ignores late completion", async () => {
    const controller = new AbortController();
    const fallback = vi.fn();
    const pending = processPixels(
      source(),
      {},
      { signal: controller.signal, onPhase: vi.fn(), onFallback: fallback },
    );
    await tick();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    workers[0].emit({ type: "done", output });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up dispatch failures and uses the same executor for fallback", async () => {
    PixelWorker.dispatchFails = true;
    const fallback = vi.fn();
    await expect(
      processPixels(source(), {}, { onPhase: vi.fn(), onFallback: fallback }),
    ).resolves.toBe(output);
    expect(fallback).toHaveBeenCalledOnce();
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases a late bitmap after decode cancellation without starting a worker", async () => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal(
      "createImageBitmap",
      () =>
        new Promise((finish) => {
          resolve = finish;
        }),
    );
    const controller = new AbortController();
    const pending = processPixels(
      source(),
      {},
      { signal: controller.signal, onPhase: vi.fn(), onFallback: vi.fn() },
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    resolve(bitmap);
    await tick();
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(workers).toHaveLength(0);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
