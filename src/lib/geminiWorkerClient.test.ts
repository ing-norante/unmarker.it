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
