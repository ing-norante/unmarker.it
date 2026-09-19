import { describe, expect, it, vi } from "vitest";
import { executePixelPipeline } from "./pixelPipeline";
import type { ProcessingContext } from "./canvas";

function surface() {
  let pixels = new Uint8ClampedArray([0, 0, 0, 0]);
  const source = { pixels: new Uint8ClampedArray([100, 120, 140, 55]) };
  const context = {
    canvas: {
      width: 1,
      height: 1,
      toBlob: vi.fn((callback: BlobCallback) =>
        callback(new Blob([pixels], { type: "image/jpeg" })),
      ),
    },
    fillStyle: "",
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(() => {
      pixels = source.pixels.slice();
    }),
    getImageData: vi.fn(() => ({ width: 1, height: 1, data: pixels })),
    putImageData: vi.fn(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
  };
  return {
    source: source as unknown as CanvasImageSource,
    context: context as unknown as ProcessingContext,
    get: context.getImageData,
    encode: context.canvas.toBlob,
  };
}

describe("shared pixel executor", () => {
  it("keeps phase order, consumes its source before noise, preserves alpha and JPEG quality", async () => {
    const { source, context, get, encode } = surface();
    const events: string[] = [];
    const random = vi.fn(() => 0.5);
    let noise = 0;
    const blob = await executePixelPipeline(
      source,
      context,
      { crush: { quality: 0.9 } },
      {
        onPhase: (phase) => events.push(phase),
        random,
        noise: { next: () => ++noise },
        onSourceConsumed: () => {
          expect(get).not.toHaveBeenCalled();
          events.push("source released");
        },
      },
    );
    expect(events).toEqual(["shake", "source released", "stir", "crush"]);
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([
      101, 122, 143, 55,
    ]);
    expect(random).toHaveBeenCalledTimes(2);
    expect(encode).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.9,
    );
  });
  it("does not read noise or encode when cancelled after consuming the source", async () => {
    const { source, context, get, encode } = surface();
    const controller = new AbortController();
    const phases: string[] = [];
    await expect(
      executePixelPipeline(
        source,
        context,
        {},
        {
          signal: controller.signal,
          onPhase: (phase) => phases.push(phase),
          onSourceConsumed: () => controller.abort(),
        },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(phases).toEqual(["shake"]);
    expect(get).not.toHaveBeenCalled();
    expect(encode).not.toHaveBeenCalled();
  });
});
