import { describe, expect, it, vi } from "vitest";
import { applyCrush, applyStir, GaussianRNG } from "./pipeline";

describe("pipeline", () => {
  it("applies Gaussian stdDev once, including cached spare samples", () => {
    const rng = new GaussianRNG(sequenceRandom([Math.exp(-0.5), 0.25]));

    expect(rng.next(10, 2)).toBeCloseTo(10);
    expect(rng.next(10, 2)).toBeCloseTo(12);
  });

  it("streams stir noise per RGB channel and keeps alpha unchanged", async () => {
    const source = new Uint8ClampedArray([100, 100, 100, 17, 250, 5, 128, 255]);
    const { ctx, putImageData } = makeCanvasContext(source, 2, 1);
    const noise = [10, -20, 300, -15, 25, -300];
    const rng = {
      next: vi.fn(() => {
        const value = noise.shift();
        if (value === undefined) {
          throw new Error("No test noise sample available");
        }
        return value;
      }),
    };

    await applyStir(ctx, { noiseAmplitude: 6 }, undefined, rng);

    expect(rng.next).toHaveBeenCalledTimes(6);
    expect(rng.next).toHaveBeenNthCalledWith(1, 0, 2);
    expect(rng.next).toHaveBeenNthCalledWith(6, 0, 2);
    expect(Array.from(source)).toEqual([110, 80, 255, 17, 235, 30, 0, 255]);
    expect(putImageData).toHaveBeenCalledTimes(1);
  });

  it("encodes crush output as a JPEG Blob", async () => {
    const expectedBlob = new Blob(["jpeg"], { type: "image/jpeg" });
    const { canvas, toBlob } = makeBlobCanvas(expectedBlob);

    const result = await applyCrush(canvas, { quality: 0.85 });

    expect(result).toBe(expectedBlob);
    expect(toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.85,
    );
  });

  it("falls back to default JPEG quality when blob encoding fails", async () => {
    const fallbackBlob = new Blob(["fallback"], { type: "image/jpeg" });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { canvas, toBlob } = makeBlobCanvasSequence([null, fallbackBlob]);

    try {
      const result = await applyCrush(canvas, { quality: 0.9 });

      expect(result).toBe(fallbackBlob);
      expect(toBlob).toHaveBeenNthCalledWith(
        1,
        expect.any(Function),
        "image/jpeg",
        0.9,
      );
      expect(toBlob).toHaveBeenNthCalledWith(
        2,
        expect.any(Function),
        "image/jpeg",
        0.92,
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

function sequenceRandom(values: number[]) {
  let index = 0;

  return () => {
    const value = values[index];
    if (value === undefined) {
      throw new Error("No test random value available");
    }
    index++;
    return value;
  };
}

function makeCanvasContext(
  data: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const imageData = { data, width, height } as ImageData;
  const ctx = {
    canvas: { width, height },
    getImageData: vi.fn(() => imageData),
    putImageData: vi.fn(),
  };

  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    putImageData: ctx.putImageData,
  };
}

function makeBlobCanvas(result: Blob | null) {
  return makeBlobCanvasSequence([result]);
}

function makeBlobCanvasSequence(results: Array<Blob | null>) {
  const toBlob = vi.fn((callback: BlobCallback) => {
    const result = results.shift();
    if (result === undefined) {
      throw new Error("No test blob result available");
    }

    callback(result);
  });

  return {
    canvas: { toBlob } as unknown as HTMLCanvasElement,
    toBlob,
  };
}
