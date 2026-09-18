import type {
  GeminiDetectionResult,
  GeminiWorkerProgressStage,
  GeminiWorkerRequest,
  GeminiWorkerResponse,
} from "./types";
import type { ProcessingContext } from "./pipeline";
import { geminiReadRegion, offsetDetection } from "./engine/geminiRegion";

export const GEMINI_JOB_TIMEOUT_MS = 45_000;

export interface GeminiJobOptions {
  signal?: AbortSignal;
  onProgress?: (stage: GeminiWorkerProgressStage) => void;
  timeoutMs?: number;
}

export interface GeminiVisibleProcessResult {
  detection: GeminiDetectionResult;
  imageData: ImageData;
  skipped: boolean;
}

interface PendingJob {
  resolve: (message: GeminiWorkerTerminalResponse) => void;
  reject: (error: Error) => void;
  onProgress?: (stage: GeminiWorkerProgressStage) => void;
  signal?: AbortSignal;
  abortListener?: () => void;
  worker: Worker;
  timeout: ReturnType<typeof setTimeout>;
}

type GeminiWorkerTerminalResponse = Exclude<
  GeminiWorkerResponse,
  { type: "progress" }
>;

let worker: Worker | null = null;
let nextJobId = 1;
const pendingJobs = new Map<number, PendingJob>();

export async function detectGeminiVisibleWatermark(
  imageData: ImageData,
  options: GeminiJobOptions = {},
) {
  const message = await runGeminiWorkerJob(
    {
      type: "detect",
      jobId: 0,
      imageData,
    },
    options,
  );

  if (message.type !== "detected") {
    throw new Error("Gemini worker returned an invalid detect response");
  }

  return message.detection;
}

export function processGeminiVisibleWatermark(
  imageData: ImageData,
  options: GeminiJobOptions & {
    detectionHint?: GeminiDetectionResult | null;
  } = {},
) {
  if (options.signal?.aborted) return Promise.reject(createAbortError());
  if (options.detectionHint?.detected === false) {
    options.onProgress?.("skipped");
    return Promise.resolve({
      detection: options.detectionHint,
      imageData,
      skipped: true,
    });
  }
  return runGeminiWorkerJob(
    {
      type: "process",
      jobId: 0,
      imageData,
      detectionHint: options.detectionHint ?? undefined,
    },
    options,
  ).then((message): GeminiVisibleProcessResult => {
    if (message.type !== "done" && message.type !== "skipped") {
      throw new Error("Gemini worker returned an invalid process response");
    }

    return {
      detection: message.detection,
      imageData: message.imageData,
      skipped: message.type === "skipped",
    };
  });
}

/** Read only the relevant corner; full-resolution pixels never enter the Gemini worker. */
export async function detectGeminiOnCanvas(
  context: ProcessingContext,
  options: GeminiJobOptions = {},
) {
  const region = geminiReadRegion(context.canvas.width, context.canvas.height);
  const detection = await detectGeminiVisibleWatermark(
    context.getImageData(region.x, region.y, region.width, region.height),
    options,
  );
  return offsetDetection(detection, region.x, region.y);
}

export async function restoreGeminiOnCanvas(
  context: ProcessingContext,
  options: GeminiJobOptions & {
    detectionHint?: GeminiDetectionResult | null;
  } = {},
) {
  if (options.signal?.aborted) throw createAbortError();
  if (options.detectionHint?.detected === false) {
    options.onProgress?.("skipped");
    return { detection: options.detectionHint, skipped: true };
  }
  const region = geminiReadRegion(context.canvas.width, context.canvas.height);
  const result = await processGeminiVisibleWatermark(
    context.getImageData(region.x, region.y, region.width, region.height),
    {
      ...options,
      detectionHint: options.detectionHint
        ? offsetDetection(options.detectionHint, -region.x, -region.y)
        : null,
    },
  );
  // Commit the patch only after the entire optional operation succeeds.
  context.putImageData(result.imageData, region.x, region.y);
  return {
    detection: offsetDetection(result.detection, region.x, region.y),
    skipped: result.skipped,
  };
}

function runGeminiWorkerJob(
  requestTemplate: GeminiWorkerRequest,
  options: GeminiJobOptions = {},
) {
  return new Promise<GeminiWorkerTerminalResponse>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const jobId = nextJobId++;
    const activeWorker = getGeminiWorker();

    const abortListener = () => {
      if (!pendingJobs.has(jobId)) return;

      terminateGeminiWorker(activeWorker);
      rejectPendingJobsForWorker(activeWorker, createAbortError);
    };

    pendingJobs.set(jobId, {
      resolve,
      reject,
      onProgress: options.onProgress,
      signal: options.signal,
      abortListener,
      worker: activeWorker,
      timeout: setTimeout(() => {
        terminateGeminiWorker(activeWorker);
        rejectPendingJobsForWorker(
          activeWorker,
          () => new Error("Gemini worker timed out"),
        );
      }, options.timeoutMs ?? GEMINI_JOB_TIMEOUT_MS),
    });

    options.signal?.addEventListener("abort", abortListener, { once: true });

    const request = {
      ...requestTemplate,
      jobId,
    } satisfies GeminiWorkerRequest;

    try {
      activeWorker.postMessage(request, [request.imageData.data.buffer]);
    } catch (error) {
      cleanupPendingJob(jobId, pendingJobs.get(jobId));
      reject(
        error instanceof Error ? error : new Error("Gemini worker failed"),
      );
    }
  });
}

function getGeminiWorker() {
  if (worker) return worker;

  const nextWorker = new Worker(
    new URL("../workers/geminiVisible.worker.ts", import.meta.url),
    { type: "module" },
  );
  worker = nextWorker;

  nextWorker.addEventListener(
    "message",
    (event: MessageEvent<GeminiWorkerResponse>) => {
      const message = event.data;
      const pending = pendingJobs.get(message.jobId);
      if (!pending || pending.worker !== nextWorker) return;

      if (message.type === "progress") {
        pending.onProgress?.(message.stage);
        return;
      }

      cleanupPendingJob(message.jobId, pending);

      if (message.type === "error") {
        terminateGeminiWorker(nextWorker);
        rejectPendingJobsForWorker(
          nextWorker,
          () => new Error("Gemini worker failed"),
        );
        pending.reject(new Error(message.debugMessage ?? message.errorCode));
        return;
      }

      pending.resolve(message);
    },
  );

  nextWorker.addEventListener("error", (event) => {
    const error = new Error(event.message || "Gemini worker failed");
    terminateGeminiWorker(nextWorker);
    rejectPendingJobsForWorker(nextWorker, () => error);
  });
  nextWorker.addEventListener("messageerror", () => {
    terminateGeminiWorker(nextWorker);
    rejectPendingJobsForWorker(
      nextWorker,
      () => new Error("Gemini worker response could not be read"),
    );
  });

  return nextWorker;
}

function terminateGeminiWorker(targetWorker: Worker) {
  targetWorker.terminate();
  if (worker === targetWorker) {
    worker = null;
  }
}

function rejectPendingJobsForWorker(
  targetWorker: Worker,
  createError: () => Error,
) {
  for (const [jobId, pending] of [...pendingJobs]) {
    if (pending.worker !== targetWorker) continue;

    cleanupPendingJob(jobId, pending);
    pending.reject(createError());
  }
}

function cleanupPendingJob(jobId: number, pending: PendingJob | undefined) {
  if (!pending) return;

  pendingJobs.delete(jobId);
  clearTimeout(pending.timeout);
  if (pending.abortListener) {
    pending.signal?.removeEventListener("abort", pending.abortListener);
  }
}

function createAbortError() {
  const error = new Error("Processing cancelled");
  error.name = "AbortError";
  return error;
}
