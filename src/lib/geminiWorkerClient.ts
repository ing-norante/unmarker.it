import type {
  GeminiDetectionResult,
  GeminiWorkerProgressStage,
  GeminiWorkerRequest,
  GeminiWorkerResponse,
} from "./types";

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
  options: {
    signal?: AbortSignal;
    onProgress?: (stage: GeminiWorkerProgressStage) => void;
  } = {},
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
  options: {
    signal?: AbortSignal;
    onProgress?: (stage: GeminiWorkerProgressStage) => void;
    detectionHint?: GeminiDetectionResult | null;
  } = {},
) {
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

function runGeminiWorkerJob(
  requestTemplate: GeminiWorkerRequest,
  options: {
    signal?: AbortSignal;
    onProgress?: (stage: GeminiWorkerProgressStage) => void;
  } = {},
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
  );
  worker = nextWorker;

  nextWorker.addEventListener(
    "message",
    (event: MessageEvent<GeminiWorkerResponse>) => {
      const message = event.data;
      const pending = pendingJobs.get(message.jobId);
      if (!pending) return;

      if (message.type === "progress") {
        pending.onProgress?.(message.stage);
        return;
      }

      cleanupPendingJob(message.jobId, pending);

      if (message.type === "error") {
        pending.reject(new Error(message.message));
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
  if (pending.abortListener) {
    pending.signal?.removeEventListener("abort", pending.abortListener);
  }
}

function createAbortError() {
  const error = new Error("Processing cancelled");
  error.name = "AbortError";
  return error;
}
