import type {
  GeminiDetectionResult,
  GeminiWorkerProgressStage,
  GeminiWorkerRequest,
  GeminiWorkerResponse,
} from "./types";
import type { ProcessingContext } from "./canvas";
import { geminiReadRegion, offsetDetection } from "./engine/geminiRegion";
import { assertNotAborted, createAbortError } from "./runtime/abort";
import { runJob, asError, type JobSettlement } from "./runtime/job";

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
  job: JobSettlement<GeminiWorkerTerminalResponse>;
  onProgress?: (stage: GeminiWorkerProgressStage) => void;
  worker: Worker;
  kind: "detect" | "process";
  width: number;
  height: number;
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
  assertNotAborted(options.signal);
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
  assertNotAborted(options.signal);
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
  const jobId = nextJobId++;
  let activeWorker: Worker | undefined;
  return runJob<GeminiWorkerTerminalResponse>(
    {
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? GEMINI_JOB_TIMEOUT_MS,
      timeoutMessage: "Gemini worker timed out",
      cleanup: () => {
        pendingJobs.delete(jobId);
      },
      onInterrupt: (error) => {
        if (activeWorker) invalidateWorker(activeWorker, error);
      },
    },
    (job) => {
      activeWorker = getGeminiWorker();
      pendingJobs.set(jobId, {
        job,
        onProgress: options.onProgress,
        worker: activeWorker,
        kind: requestTemplate.type,
        width: requestTemplate.imageData.width,
        height: requestTemplate.imageData.height,
      });
      const request = {
        ...requestTemplate,
        jobId,
      } satisfies GeminiWorkerRequest;
      activeWorker.postMessage(request, [request.imageData.data.buffer]);
    },
  );
}

const terminatedWorkers = new WeakSet<Worker>();
const progressStages = new Set<GeminiWorkerProgressStage>([
  "loading-opencv",
  "loading-alpha",
  "detecting",
  "restoring",
  "inpainting",
  "done",
  "skipped",
  "error",
]);

function getGeminiWorker() {
  if (worker) return worker;
  const nextWorker = new Worker(
    new URL("../workers/geminiVisible.worker.ts", import.meta.url),
    { type: "module" },
  );
  worker = nextWorker;
  nextWorker.addEventListener("message", (event: MessageEvent<unknown>) => {
    const message = event.data;
    if (!isRecord(message) || typeof message.jobId !== "number") {
      invalidateWorker(nextWorker, new Error("Invalid Gemini worker response"));
      return;
    }
    const pending = pendingJobs.get(message.jobId);
    if (!pending || pending.worker !== nextWorker) return;
    if (
      message.type === "progress" &&
      progressStages.has(message.stage as GeminiWorkerProgressStage)
    ) {
      try {
        pending.onProgress?.(message.stage as GeminiWorkerProgressStage);
      } catch (error) {
        pending.job.reject(asError(error));
      }
      return;
    }
    if (message.type === "error") {
      invalidateWorker(
        nextWorker,
        new Error(
          typeof message.debugMessage === "string"
            ? message.debugMessage
            : "gemini-worker-failed",
        ),
      );
      return;
    }
    if (!validTerminal(message, pending)) {
      invalidateWorker(nextWorker, new Error("Invalid Gemini worker response"));
      return;
    }
    pending.job.resolve(message);
  });
  nextWorker.addEventListener("error", (event) =>
    invalidateWorker(
      nextWorker,
      new Error(event.message || "Gemini worker failed"),
    ),
  );
  nextWorker.addEventListener("messageerror", () =>
    invalidateWorker(
      nextWorker,
      new Error("Gemini worker response could not be read"),
    ),
  );
  return nextWorker;
}

function invalidateWorker(target: Worker, error: Error) {
  if (!terminatedWorkers.has(target)) {
    terminatedWorkers.add(target);
    target.terminate();
  }
  if (worker === target) worker = null;
  // This runtime is intentionally shared, not a pool. Interruption invalidates its jobs.
  for (const pending of [...pendingJobs.values()])
    if (pending.worker === target) pending.job.reject(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validTerminal(
  message: Record<string, unknown>,
  pending: PendingJob,
): message is Record<string, unknown> & GeminiWorkerTerminalResponse {
  if (!validDetection(message.detection, pending.width, pending.height))
    return false;
  if (pending.kind === "detect") return message.type === "detected";
  if (message.type !== "done" && message.type !== "skipped") return false;
  const image = message.imageData;
  return (
    isRecord(image) &&
    image.width === pending.width &&
    image.height === pending.height &&
    image.data instanceof Uint8ClampedArray &&
    image.data.length === pending.width * pending.height * 4
  );
}

function validDetection(
  value: unknown,
  width: number,
  height: number,
): value is GeminiDetectionResult {
  if (
    !isRecord(value) ||
    typeof value.detected !== "boolean" ||
    !isRecord(value.region)
  )
    return false;
  if (
    ![
      value.confidence,
      value.spatialScore,
      value.gradientScore,
      value.varianceScore,
    ].every((score) => typeof score === "number" && Number.isFinite(score))
  )
    return false;
  const region = value.region;
  return (
    [region.x, region.y, region.width, region.height].every(
      (coordinate) =>
        typeof coordinate === "number" &&
        Number.isInteger(coordinate) &&
        coordinate >= 0,
    ) &&
    Number(region.x) + Number(region.width) <= width &&
    Number(region.y) + Number(region.height) <= height
  );
}
