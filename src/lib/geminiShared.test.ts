import { describe, expect, it } from "vitest";
import {
  fuseGeminiConfidence,
  getGeminiSearchSize,
  getGeminiWatermarkConfig,
  reverseAlphaBlendRgba,
  type RgbaImageDataLike,
} from "./geminiShared";

describe("geminiShared", () => {
  it("uses the 48px Gemini logo profile for images up to 1024px on either side", () => {
    expect(getGeminiWatermarkConfig(1024, 1024)).toMatchObject({
      size: "small",
      marginRight: 32,
      marginBottom: 32,
      logoSize: 48,
    });
    expect(getGeminiWatermarkConfig(2000, 500)).toMatchObject({
      size: "small",
      logoSize: 48,
    });
  });

  it("uses the 96px Gemini logo profile when both dimensions are above 1024px", () => {
    expect(getGeminiWatermarkConfig(1200, 1200)).toMatchObject({
      size: "large",
      marginRight: 64,
      marginBottom: 64,
      logoSize: 96,
    });
  });

  it("limits the search region to the bottom-right 256px square", () => {
    expect(getGeminiSearchSize(1200, 900)).toBe(256);
    expect(getGeminiSearchSize(160, 900)).toBe(160);
  });

  it("fuses Gemini confidence with the Python engine weights", () => {
    expect(fuseGeminiConfidence(0.6, 0.4, 0.2)).toBeCloseTo(0.46);
    expect(fuseGeminiConfidence(2, 2, 2)).toBe(1);
    expect(fuseGeminiConfidence(-1, -1, -1)).toBe(0);
  });

  it("reverses alpha blending without changing alpha channel", () => {
    const image = makeImage(1, 1, [178, 178, 178, 123]);

    reverseAlphaBlendRgba(image, new Float32Array([0.5]), {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });

    expect(image.data[0]).toBeCloseTo(101, 0);
    expect(image.data[1]).toBeCloseTo(101, 0);
    expect(image.data[2]).toBeCloseTo(101, 0);
    expect(image.data[3]).toBe(123);
  });

  it("leaves pixels unchanged below the alpha threshold", () => {
    const image = makeImage(1, 1, [10, 20, 30, 255]);

    reverseAlphaBlendRgba(image, new Float32Array([0.001]), {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });

    expect(Array.from(image.data)).toEqual([10, 20, 30, 255]);
  });

  it("reduces mean error on a synthetic watermarked patch", () => {
    const original = makeGradientImage(8, 8);
    const watermarked = cloneImage(original);
    const alpha = makeSoftAlpha(4, 4);
    const region = { x: 2, y: 2, width: 4, height: 4 };

    applyForwardAlphaBlend(watermarked, alpha, region);
    const before = meanAbsoluteDiff(original, watermarked, region);

    reverseAlphaBlendRgba(watermarked, alpha, region);
    const after = meanAbsoluteDiff(original, watermarked, region);

    expect(after).toBeLessThan(before * 0.2);
  });
});

function makeImage(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): RgbaImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data.set(rgba, i);
  }
  return { width, height, data };
}

function makeGradientImage(width: number, height: number): RgbaImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = 50 + x * 10;
      data[i + 1] = 60 + y * 8;
      data[i + 2] = 80 + x * 4 + y * 3;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

function cloneImage(image: RgbaImageDataLike): RgbaImageDataLike {
  return {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data),
  };
}

function makeSoftAlpha(width: number, height: number) {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data[y * width + x] = 0.08 + (x + y) * 0.02;
    }
  }
  return data;
}

function applyForwardAlphaBlend(
  image: RgbaImageDataLike,
  alpha: Float32Array,
  region: { x: number; y: number; width: number; height: number },
) {
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const a = alpha[y * region.width + x];
      const i = ((region.y + y) * image.width + region.x + x) * 4;
      image.data[i] = Math.round(a * 255 + (1 - a) * image.data[i]);
      image.data[i + 1] = Math.round(a * 255 + (1 - a) * image.data[i + 1]);
      image.data[i + 2] = Math.round(a * 255 + (1 - a) * image.data[i + 2]);
    }
  }
}

function meanAbsoluteDiff(
  a: RgbaImageDataLike,
  b: RgbaImageDataLike,
  region: { x: number; y: number; width: number; height: number },
) {
  let total = 0;
  let count = 0;

  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const i = ((region.y + y) * a.width + region.x + x) * 4;
      total += Math.abs(a.data[i] - b.data[i]);
      total += Math.abs(a.data[i + 1] - b.data[i + 1]);
      total += Math.abs(a.data[i + 2] - b.data[i + 2]);
      count += 3;
    }
  }

  return total / count;
}
