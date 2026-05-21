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
  resolve: (result: GeminiVisibleProcessResult) => void;
  reject: (error: Error) => void;
  onProgress?: (stage: GeminiWorkerProgressStage) => void;
  signal?: AbortSignal;
  abortListener?: () => void;
}

let worker: Worker | null = null;
let nextJobId = 1;
const pendingJobs = new Map<number, PendingJob>();

export function processGeminiVisibleWatermark(
  imageData: ImageData,
  options: {
    signal?: AbortSignal;
    onProgress?: (stage: GeminiWorkerProgressStage) => void;
  } = {},
) {
  const jobId = nextJobId++;
  const activeWorker = getGeminiWorker();

  return new Promise<GeminiVisibleProcessResult>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const abortListener = () => {
      pendingJobs.delete(jobId);
      reject(createAbortError());
    };

    pendingJobs.set(jobId, {
      resolve,
      reject,
      onProgress: options.onProgress,
      signal: options.signal,
      abortListener,
    });

    options.signal?.addEventListener("abort", abortListener, { once: true });

    const request: GeminiWorkerRequest = {
      type: "process",
      jobId,
      imageData,
    };

    activeWorker.postMessage(request, [imageData.data.buffer]);
  });
}

function getGeminiWorker() {
  if (worker) return worker;

  worker = new Worker(new URL("../workers/geminiVisible.worker.ts", import.meta.url));

  worker.addEventListener("message", (event: MessageEvent<GeminiWorkerResponse>) => {
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

    pending.resolve({
      detection: message.detection,
      imageData: message.imageData,
      skipped: message.type === "skipped",
    });
  });

  worker.addEventListener("error", (event) => {
    const error = new Error(event.message || "Gemini worker failed");
    for (const [jobId, pending] of pendingJobs) {
      cleanupPendingJob(jobId, pending);
      pending.reject(error);
    }
  });

  return worker;
}

function cleanupPendingJob(jobId: number, pending: PendingJob) {
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
