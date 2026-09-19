import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeminiDetectionResult, MetadataScanResult } from "@/lib/types";
import type { ImageEngineProgress } from "./types";

const mocks = vi.hoisted(() => ({
  scan: vi.fn(),
  decode: vi.fn(),
  createCanvas: vi.fn(),
  releaseCanvas: vi.fn(),
  detect: vi.fn(),
  restore: vi.fn(),
  pixels: vi.fn(),
  bitmapRelease: vi.fn(),
}));
vi.mock("@/lib/metadataCleaner", () => ({
  scanImageMetadata: mocks.scan,
  canCleanMetadata: () => true,
}));
vi.mock("@/lib/geminiWorkerClient", () => ({
  detectGeminiOnCanvas: mocks.detect,
  restoreGeminiOnCanvas: mocks.restore,
}));
vi.mock("./pixels", () => ({ processPixels: mocks.pixels }));
vi.mock("./canvas", () => ({
  decodeImage: mocks.decode,

  ImageResolutionError: class extends Error {},
}));
vi.mock("@/lib/canvas", () => ({
  createProcessingCanvas: mocks.createCanvas,
  getProcessingContext: () => ({ drawImage: vi.fn() }),
  releaseCanvas: mocks.releaseCanvas,
}));
import { processImage } from "./processImage";

const negative: GeminiDetectionResult = {
  detected: false,
  confidence: 0,
  region: { x: 0, y: 0, width: 1, height: 1 },
  spatialScore: 0,
  gradientScore: 0,
  varianceScore: 0,
};
const metadata: MetadataScanResult = {
  format: "png",
  hasAiMetadata: false,
  signals: [],
  warnings: [],
};
const output = new Blob(["output"], { type: "image/jpeg" });
const input = () => new File(["original"], "image.png", { type: "image/png" });

describe("autonomous image engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scan.mockResolvedValue(metadata);
    mocks.decode.mockResolvedValue({
      source: {},
      width: 8000,
      height: 5000,
      release: mocks.bitmapRelease,
    });
    mocks.createCanvas.mockImplementation((width: number, height: number) => ({
      width,
      height,
    }));
    mocks.detect.mockResolvedValue(negative);
    mocks.restore.mockResolvedValue({ detection: negative, skipped: true });
    mocks.pixels.mockImplementation(async (_canvas, _options, controls) => {
      controls.onPhase("shake");
      controls.onPhase("stir");
      controls.onPhase("crush");
      return output;
    });
  });

  it("reuses preflight including negative hints and verifies the actual output", async () => {
    const progress: ImageEngineProgress[] = [];
    const result = await processImage(
      input(),
      {},
      { onProgress: (value) => progress.push(value) },
    );
    expect(result.output).toBe(output);
    expect(result.outcome).toBe("completed");
    expect(mocks.restore.mock.calls[0][1].detectionHint).toBe(negative);
    expect(mocks.decode).toHaveBeenCalledTimes(2); // Original once, output once.
    expect(mocks.scan.mock.calls[1][0].type).toBe("image/jpeg");
    expect(await mocks.scan.mock.calls[1][0].text()).toBe("output");
    expect(mocks.createCanvas.mock.calls).toEqual([
      [8000, 5000],
      [288, 374],
    ]);
    expect(mocks.releaseCanvas).toHaveBeenCalledTimes(2);
    expect(mocks.bitmapRelease).toHaveBeenCalledTimes(2);
    expect(progress.at(-1)?.phase).toBe("complete");
    expect(progress[0].steps.every((step) => step.status === "idle")).toBe(
      true,
    );
    expect(
      progress
        .at(-1)
        ?.steps.filter((step) => step.id !== "gemini-restore")
        .every((step) => step.status === "done"),
    ).toBe(true);
  });

  it("continues independent pixel processing with an explicit restoration warning", async () => {
    mocks.detect.mockResolvedValueOnce({ ...negative, detected: true });
    mocks.restore.mockRejectedValueOnce(new Error("OpenCV failed"));
    const result = await processImage(input());
    expect(result.output).toBe(output);
    expect(result.outcome).toBe("completed-with-warnings");
    expect(result.warnings).toContainEqual({
      key: "workflow:warnings.visibleRestore",
    });
    expect(mocks.pixels).toHaveBeenCalledOnce();
    expect(mocks.releaseCanvas).toHaveBeenCalledTimes(2);
  });

  it("isolates a metadata scan failure from usable image processing", async () => {
    mocks.scan.mockRejectedValueOnce(new Error("Malformed metadata"));
    const result = await processImage(input());
    expect(result.preflight.metadataScan).toBeNull();
    expect(result.output).toBe(output);
    expect(result.warnings).toContainEqual({
      key: "workflow:warnings.preflightMetadata",
    });
  });

  it("keeps metadata analysis available for an undecodable supported format", async () => {
    mocks.decode.mockRejectedValueOnce(
      new Error("Unsupported browser decoder"),
    );
    const result = await processImage(input());
    expect(result.outcome).toBe("analysis-only");
    expect(result.canCleanMetadata).toBe(true);
    expect(result.output).toBeNull();
    expect(mocks.pixels).not.toHaveBeenCalled();
    expect(mocks.createCanvas).not.toHaveBeenCalled();
  });

  it("releases canvas resources after cancellation and never returns a stale output", async () => {
    const controller = new AbortController();
    mocks.pixels.mockImplementationOnce(async () => {
      controller.abort();
      return output;
    });
    await expect(
      processImage(input(), {}, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.releaseCanvas).toHaveBeenCalledOnce();
    expect(mocks.scan).toHaveBeenCalledOnce();
  });
  it("waits for the cooperative metadata scan to stop before finishing cancellation", async () => {
    const controller = new AbortController();
    let finishScan!: (value: MetadataScanResult) => void;
    mocks.scan.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishScan = resolve;
        }),
    );
    const file = input();
    const job = processImage(file, {}, { signal: controller.signal });
    let settled = false;
    const observed = job.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    controller.abort();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(mocks.scan).toHaveBeenCalledWith(file, {
      signal: controller.signal,
    });
    finishScan(metadata);
    await expect(job).rejects.toMatchObject({ name: "AbortError" });
    await observed;
    expect(mocks.decode).not.toHaveBeenCalled();
  });

  it("releases decoded resources if canvas creation fails", async () => {
    mocks.createCanvas.mockImplementationOnce(() => {
      throw new Error("Allocation failed");
    });
    await expect(processImage(input())).rejects.toThrow("Allocation failed");
    expect(mocks.bitmapRelease).toHaveBeenCalledOnce();
  });

  it("rejects invalid input before scanning or decoding", async () => {
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    await expect(processImage(file)).rejects.toMatchObject({
      code: "invalid-file",
    });
    expect(mocks.scan).not.toHaveBeenCalled();
    expect(mocks.decode).not.toHaveBeenCalled();
  });

  it("reports a remaining visible logo rather than implying successful removal", async () => {
    mocks.detect
      .mockResolvedValueOnce(negative)
      .mockResolvedValueOnce({ ...negative, detected: true });
    const result = await processImage(input());
    expect(result.outcome).toBe("completed-with-warnings");
    expect(result.warnings).toContainEqual({
      key: "workflow:warnings.residualVisible",
    });
  });
});
