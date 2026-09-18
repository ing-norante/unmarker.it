import {
  applyCrush,
  applyShake,
  applyStir,
  type ProcessingCanvas,
} from "@/lib/pipeline";
import type { ProcessingOptions } from "@/lib/types";
import {
  abortable,
  assertNotAborted,
  createAbortError,
  isAbortError,
} from "./abort";
import {
  createProcessingCanvas,
  getProcessingContext,
  releaseCanvas,
} from "./canvas";
import type { PixelPhase, PixelRequest, PixelResponse } from "./pixelProtocol";

export interface PixelControls {
  signal?: AbortSignal;
  onPhase: (phase: PixelPhase) => void;
  onFallback: () => void;
}

export async function processPixels(
  canvas: ProcessingCanvas,
  options: ProcessingOptions,
  controls: PixelControls,
): Promise<Blob> {
  assertNotAborted(controls.signal);
  if (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap === "function"
  ) {
    try {
      return await processInWorker(canvas, options, controls);
    } catch (error) {
      if (isAbortError(error)) throw error;
      controls.onFallback();
    }
  }
  return processOnCanvas(canvas, options, controls);
}

async function processInWorker(
  canvas: ProcessingCanvas,
  options: ProcessingOptions,
  controls: PixelControls,
): Promise<Blob> {
  const bitmap = await abortable(
    createImageBitmap(canvas),
    controls.signal,
    (late) => late.close(),
  );
  let worker: Worker;
  try {
    assertNotAborted(controls.signal);
    worker = new Worker(
      new URL("../../workers/pixels.worker.ts", import.meta.url),
      { type: "module" },
    );
  } catch (error) {
    bitmap.close();
    throw error;
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, output?: Blob) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      controls.signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      bitmap.close();
      if (error) reject(error);
      else if (output) resolve(output);
    };
    const onAbort = () => finish(createAbortError());
    const timeout = setTimeout(
      () => finish(new Error("Pixel worker timed out")),
      120_000,
    );
    controls.signal?.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<PixelResponse>) => {
      if (settled) return;
      if (data.type === "progress") controls.onPhase(data.phase);
      else if (data.type === "error") finish(new Error(data.reason));
      else finish(undefined, data.output);
    };
    worker.onerror = () => finish(new Error("Pixel worker failed"));
    worker.onmessageerror = () =>
      finish(new Error("Pixel worker response could not be read"));
    try {
      assertNotAborted(controls.signal);
      worker.postMessage({ bitmap, options } satisfies PixelRequest, [bitmap]);
    } catch (error) {
      finish(
        error instanceof Error ? error : new Error("Pixel worker unavailable"),
      );
    }
  });
}

async function processOnCanvas(
  canvas: ProcessingCanvas,
  options: ProcessingOptions,
  controls: PixelControls,
) {
  const context = getProcessingContext(canvas);
  const snapshot = createProcessingCanvas(canvas.width, canvas.height);
  try {
    getProcessingContext(snapshot).drawImage(canvas, 0, 0);
    controls.onPhase("shake");
    await applyShake(context, snapshot, options.shake, controls.signal);
  } finally {
    releaseCanvas(snapshot);
  }
  controls.onPhase("stir");
  await applyStir(context, options.stir, controls.signal);
  controls.onPhase("crush");
  return applyCrush(canvas, options.crush, controls.signal);
}
