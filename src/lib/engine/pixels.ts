import {
  createProcessingCanvas,
  getProcessingContext,
  releaseCanvas,
  type ProcessingCanvas,
} from "@/lib/canvas";
import { executePixelPipeline } from "@/lib/pixelPipeline";
import type { ProcessingOptions } from "@/lib/types";
import { abortable, assertNotAborted, isAbortError } from "@/lib/runtime/abort";
import { runJob, asError } from "@/lib/runtime/job";
import type { PixelPhase, PixelRequest } from "./pixelProtocol";

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
      if (isAbortError(error) || controls.signal?.aborted) throw error;
      controls.onFallback();
    }
  }
  assertNotAborted(controls.signal);
  return processOnCanvas(canvas, options, controls);
}

async function processInWorker(
  canvas: ProcessingCanvas,
  options: ProcessingOptions,
  controls: PixelControls,
): Promise<Blob> {
  // A worker gets its own bitmap; the source canvas stays intact for fallback.
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
  return runJob<Blob>(
    {
      signal: controls.signal,
      timeoutMs: 120_000,
      timeoutMessage: "Pixel worker timed out",
      cleanup: () => {
        worker.terminate();
        bitmap.close();
      },
    },
    (job) => {
      worker.onmessage = ({ data }: MessageEvent<unknown>) => {
        if (job.settled) return;
        if (!data || typeof data !== "object" || !("type" in data)) {
          job.reject(new Error("Invalid pixel worker response"));
          return;
        }
        if (
          data.type === "progress" &&
          "phase" in data &&
          typeof data.phase === "string" &&
          ["shake", "stir", "crush"].includes(data.phase)
        ) {
          try {
            controls.onPhase(data.phase as PixelPhase);
          } catch (error) {
            job.reject(asError(error));
          }
        } else if (
          data.type === "done" &&
          "output" in data &&
          data.output instanceof Blob &&
          data.output.size > 0
        ) {
          job.resolve(data.output);
        } else if (
          data.type === "error" &&
          "reason" in data &&
          typeof data.reason === "string"
        ) {
          job.reject(new Error(data.reason));
        } else job.reject(new Error("Invalid pixel worker response"));
      };
      worker.onerror = () => job.reject(new Error("Pixel worker failed"));
      worker.onmessageerror = () =>
        job.reject(new Error("Pixel worker response could not be read"));
      worker.postMessage({ bitmap, options } satisfies PixelRequest, [bitmap]);
    },
  );
}

async function processOnCanvas(
  canvas: ProcessingCanvas,
  options: ProcessingOptions,
  controls: PixelControls,
) {
  const context = getProcessingContext(canvas);
  const snapshot = createProcessingCanvas(canvas.width, canvas.height);
  let released = false;
  const releaseSource = () => {
    if (!released) {
      released = true;
      releaseCanvas(snapshot);
    }
  };
  try {
    getProcessingContext(snapshot).drawImage(canvas, 0, 0);
    return await executePixelPipeline(snapshot, context, options, {
      ...controls,
      onSourceConsumed: releaseSource,
    });
  } finally {
    releaseSource();
  }
}
