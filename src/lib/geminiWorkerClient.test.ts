import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeminiDetectionResult } from "./types";

const workers: MockWorker[] = [];

class MockWorker {
  private listeners = new Map<string, EventListenerOrEventListenerObject>();

  messages: unknown[] = [];
  postMessage = vi.fn((message: unknown) => {
    this.messages.push(message);
  });
  terminate = vi.fn();
  addEventListener = vi.fn(
    (type: string, listener: EventListenerOrEventListenerObject) => {
      this.listeners.set(type, listener);
    },
  );

  constructor() {
    workers.push(this);
  }

  emitMessage(data: unknown) {
    const listener = this.listeners.get("message");
    if (!listener) return;

    const event = { data } as MessageEvent;
    if (typeof listener === "function") {
      listener(event);
      return;
    }

    listener.handleEvent(event);
  }
}

describe("geminiWorkerClient", () => {
  beforeEach(() => {
    workers.length = 0;
    vi.resetModules();
    vi.stubGlobal("Worker", MockWorker);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not create a worker when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { processGeminiVisibleWatermark } =
      await import("./geminiWorkerClient");

    await expect(
      processGeminiVisibleWatermark(makeImageData(), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(workers).toHaveLength(0);
  });

  it("terminates the active worker on abort and recreates it for the next job", async () => {
    const { processGeminiVisibleWatermark } =
      await import("./geminiWorkerClient");
    const controller = new AbortController();

    const abortedPromise = processGeminiVisibleWatermark(makeImageData(), {
      signal: controller.signal,
    });
    const firstWorker = workers[0];

    expect(firstWorker).toBeDefined();
    expect(workers).toHaveLength(1);

    controller.abort();

    await expect(abortedPromise).rejects.toMatchObject({ name: "AbortError" });
    expect(firstWorker?.terminate).toHaveBeenCalledTimes(1);

    const resultImage = makeImageData();
    const nextPromise = processGeminiVisibleWatermark(makeImageData());
    const nextWorker = workers[1];

    expect(nextWorker).toBeDefined();
    expect(nextWorker).not.toBe(firstWorker);
    expect(workers).toHaveLength(2);

    nextWorker?.emitMessage({
      type: "done",
      jobId: getJobId(nextWorker),
      detection: makeDetection(),
      imageData: resultImage,
    });

    const result = await nextPromise;

    expect(result.imageData).toBe(resultImage);
    expect(result.skipped).toBe(false);
  });

  it("supports detect-only jobs", async () => {
    const { detectGeminiVisibleWatermark } =
      await import("./geminiWorkerClient");

    const promise = detectGeminiVisibleWatermark(makeImageData());
    const activeWorker = workers[0];
    const detection = makeDetection();

    activeWorker?.emitMessage({
      type: "detected",
      jobId: getJobId(activeWorker),
      detection,
    });

    await expect(promise).resolves.toBe(detection);
    expect(getJobType(activeWorker)).toBe("detect");
  });

  it("passes detection hints to process jobs", async () => {
    const { processGeminiVisibleWatermark } =
      await import("./geminiWorkerClient");
    const detection = makeDetection();

    const promise = processGeminiVisibleWatermark(makeImageData(), {
      detectionHint: detection,
    });
    const activeWorker = workers[0];
    const resultImage = makeImageData();

    expect(getJobMessage(activeWorker).detectionHint).toBe(detection);

    activeWorker?.emitMessage({
      type: "skipped",
      jobId: getJobId(activeWorker),
      detection,
      imageData: resultImage,
    });

    const result = await promise;

    expect(result.skipped).toBe(true);
    expect(result.detection).toBe(detection);
  });

  it("reuses a negative hint without creating a worker or transferring pixels", async () => {
    const { processGeminiVisibleWatermark } =
      await import("./geminiWorkerClient");
    const image = makeImageData();
    const detection = { ...makeDetection(), detected: false };
    const result = await processGeminiVisibleWatermark(image, {
      detectionHint: detection,
    });
    expect(result).toEqual({ detection, imageData: image, skipped: true });
    expect(workers).toHaveLength(0);
    expect(image.data.byteLength).toBe(4);
  });

  it("terminates a hung worker after its deadline and starts the next job fresh", async () => {
    vi.useFakeTimers();
    const { detectGeminiVisibleWatermark } =
      await import("./geminiWorkerClient");
    const task = detectGeminiVisibleWatermark(makeImageData(), {
      timeoutMs: 100,
    });
    const rejection = expect(task).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    const next = detectGeminiVisibleWatermark(makeImageData());
    workers[1].emitMessage({
      type: "detected",
      jobId: getJobId(workers[1]),
      detection: makeDetection(),
    });
    await next;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("discards a failed runtime so initialization can recover", async () => {
    const { detectGeminiVisibleWatermark } =
      await import("./geminiWorkerClient");
    const task = detectGeminiVisibleWatermark(makeImageData());
    workers[0].emitMessage({
      type: "error",
      jobId: getJobId(workers[0]),
      errorCode: "gemini-worker-failed",
    });
    await expect(task).rejects.toThrow("gemini-worker-failed");
    const next = detectGeminiVisibleWatermark(makeImageData());
    workers[1].emitMessage({
      type: "detected",
      jobId: getJobId(workers[1]),
      detection: makeDetection(),
    });
    await next;
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });

  it("reads a bounded corner and translates detection back to full-image coordinates", async () => {
    const { detectGeminiOnCanvas } = await import("./geminiWorkerClient");
    const context = {
      canvas: { width: 8000, height: 5000 },
      getImageData: vi.fn(() => makeImageData()),
    };
    const task = detectGeminiOnCanvas(
      context as unknown as CanvasRenderingContext2D,
    );
    expect(context.getImageData).toHaveBeenCalledWith(7712, 4626, 288, 374);
    workers[0].emitMessage({
      type: "detected",
      jobId: getJobId(workers[0]),
      detection: makeDetection(),
    });
    const result = await task;
    expect(result.region).toMatchObject({ x: 7712, y: 4626 });
  });

  it("does not alter the source canvas when restoration fails", async () => {
    const { restoreGeminiOnCanvas } = await import("./geminiWorkerClient");
    const context = {
      canvas: { width: 8000, height: 5000 },
      getImageData: vi.fn(() => makeImageData()),
      putImageData: vi.fn(),
    };
    const task = restoreGeminiOnCanvas(
      context as unknown as CanvasRenderingContext2D,
    );
    workers[0].emitMessage({
      type: "error",
      jobId: getJobId(workers[0]),
      errorCode: "gemini-worker-failed",
    });
    await expect(task).rejects.toThrow();
    expect(context.putImageData).not.toHaveBeenCalled();
  });
  it("rejects malformed responses and recovers with a fresh runtime", async () => {
    const { detectGeminiVisibleWatermark } =
      await import("./geminiWorkerClient");
    const failed = detectGeminiVisibleWatermark(makeImageData());
    workers[0].emitMessage({ type: "detected", jobId: getJobId(workers[0]) });
    await expect(failed).rejects.toThrow("Invalid Gemini worker response");
    const next = detectGeminiVisibleWatermark(makeImageData());
    workers[1].emitMessage({
      type: "detected",
      jobId: getJobId(workers[1]),
      detection: makeDetection(),
    });
    await next;
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });
  it("invalidates every pending job when the shared runtime is interrupted", async () => {
    const { detectGeminiVisibleWatermark } =
      await import("./geminiWorkerClient");
    const controller = new AbortController();
    const first = detectGeminiVisibleWatermark(makeImageData(), {
      signal: controller.signal,
    });
    const second = detectGeminiVisibleWatermark(makeImageData());
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    expect(workers).toHaveLength(1);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });
});

function makeImageData() {
  return {
    data: new Uint8ClampedArray([0, 0, 0, 255]),
    width: 1,
    height: 1,
  } as ImageData;
}

function makeDetection(): GeminiDetectionResult {
  return {
    detected: true,
    confidence: 1,
    region: { x: 0, y: 0, width: 1, height: 1 },
    spatialScore: 1,
    gradientScore: 1,
    varianceScore: 1,
  };
}

function getJobId(worker: MockWorker) {
  return getJobMessage(worker).jobId;
}

function getJobType(worker: MockWorker) {
  return getJobMessage(worker).type;
}

function getJobMessage(worker: MockWorker) {
  const [message] = worker.messages;
  if (!isJobMessage(message)) {
    throw new Error("Expected the worker to receive a Gemini job message");
  }

  return message;
}

function isJobMessage(message: unknown): message is {
  jobId: number;
  type: string;
  detectionHint?: GeminiDetectionResult;
} {
  return (
    typeof message === "object" &&
    message !== null &&
    "jobId" in message &&
    typeof (message as { jobId?: unknown }).jobId === "number"
  );
}
