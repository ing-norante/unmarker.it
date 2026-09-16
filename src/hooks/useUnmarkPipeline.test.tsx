import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUnmarkPipeline } from "./useUnmarkPipeline";
import { applyCrush, applyShake, applyStir } from "@/lib/pipeline";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/pipeline", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pipeline")>(),
  applyShake: vi.fn(async () => {}),
  applyStir: vi.fn(async () => {}),
  applyCrush: vi.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" })),
}));
vi.mock("@/lib/geminiWorkerClient", () => ({
  processGeminiVisibleWatermark: vi.fn(async (imageData: ImageData) => ({
    imageData,
    detection: { detected: false },
    skipped: true,
  })),
}));

function mountPipeline() {
  let pipeline!: ReturnType<typeof useUnmarkPipeline>;
  function Harness() {
    pipeline = useUnmarkPipeline({ originalImage: new File(["image"], "image.png"), setStatusMessage: vi.fn() });
    return null;
  }
  renderToString(<Harness />);
  pipeline.canvasRef.current = document.createElement("canvas");
  return pipeline;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("Image", class {
    width = 1;
    height = 1;
    onload?: () => void;
    set src(_value: string) { this.onload?.(); }
  });
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 1,
      height: 1,
      getContext: () => ({
        clearRect: vi.fn(), drawImage: vi.fn(), putImageData: vi.fn(),
        getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
      }),
    }),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("processing scheduling", () => {
  it("finishes without fixed presentation delays", async () => {
    const pipeline = mountPipeline();
    const startedAt = Date.now();
    const result = pipeline.processPipeline();
    await vi.runAllTimersAsync();

    expect((await result).ok).toBe(true);
    expect(applyShake).toHaveBeenCalledOnce();
    expect(applyStir).toHaveBeenCalledOnce();
    expect(applyCrush).toHaveBeenCalledOnce();
    expect(Date.now() - startedAt).toBeLessThan(50);
  });

  it("stops subsequent stages when cancelled between stages", async () => {
    const pipeline = mountPipeline();
    vi.mocked(applyShake).mockImplementationOnce(async () => pipeline.cancelProcessing());
    const result = pipeline.processPipeline();
    await vi.runAllTimersAsync();

    expect(await result).toEqual({ ok: false, reason: "cancelled" });
    expect(applyStir).not.toHaveBeenCalled();
    expect(applyCrush).not.toHaveBeenCalled();
  });
});
