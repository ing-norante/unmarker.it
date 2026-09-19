import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GeminiWorkerRequest, GeminiWorkerResponse } from "../lib/types";
const runtimeStats = vi.hoisted(() => ({
  conversions: [] as Array<[number, number]>,
}));

// Load the real CommonJS Promise without Vitest's synthetic namespace thenable.
vi.mock("@techstark/opencv-js", async () => {
  const { createRequire } = await import("node:module");
  const runtime = createRequire(import.meta.url)("@techstark/opencv-js");
  return {
    default: runtime.then(
      (cv: { matFromImageData: (image: ImageData) => unknown }) => {
        const fromImageData = cv.matFromImageData;
        cv.matFromImageData = (image) => {
          runtimeStats.conversions.push([image.width, image.height]);
          return fromImageData(image);
        };
        return cv;
      },
    ),
  };
});

/** Exercise the installed OpenCV runtime and real alpha maps with browser decoding shims. */
describe("Gemini worker / OpenCV runtime", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("detects and restores a synthetic logo using OpenCV 5 and preserves unrelated pixels", async () => {
    let receive!: (event: MessageEvent<GeminiWorkerRequest>) => void;
    let onTerminal!: (response: GeminiWorkerResponse) => void;
    const terminal = () =>
      new Promise<GeminiWorkerResponse>((resolve) => {
        onTerminal = resolve;
      });
    const assets = new Map<string, Buffer>();
    for (const size of [48, 96]) {
      assets.set(
        `/gemini/gemini_bg_${size}.png`,
        await readFile(
          new URL(`../../public/gemini/gemini_bg_${size}.png`, import.meta.url),
        ),
      );
    }
    class ImageDataShim {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    }
    vi.stubGlobal("ImageData", ImageDataShim);
    vi.stubGlobal("self", {
      addEventListener: (_type: string, callback: typeof receive) => {
        receive = callback;
      },
      postMessage: (response: GeminiWorkerResponse) => {
        if (response.type !== "progress") onTerminal(response);
      },
      setTimeout,
    });
    vi.stubGlobal("fetch", async (path: string) => {
      const bytes = assets.get(path);
      if (!bytes) throw new Error(`Unexpected network request: ${path}`);
      return { ok: true, blob: async () => new Blob([new Uint8Array(bytes)]) };
    });
    vi.stubGlobal("createImageBitmap", async (blob: Blob) => {
      const { data, info } = await sharp(Buffer.from(await blob.arrayBuffer()))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return {
        data: new Uint8ClampedArray(data),
        width: info.width,
        height: info.height,
        close: () => {},
      };
    });
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        bitmap: ImageDataShim | null = null;
        width: number;
        height: number;
        constructor(width: number, height: number) {
          this.width = width;
          this.height = height;
        }
        getContext() {
          return {
            drawImage: (bitmap: ImageDataShim) => {
              this.bitmap = bitmap;
            },
            getImageData: () => this.bitmap,
          };
        }
      },
    );
    await import("./geminiVisible.worker");
    const { data: alpha } = await sharp(assets.get("/gemini/gemini_bg_48.png")!)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = new Uint8ClampedArray(512 * 512 * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 40;
      pixels[i + 1] = 60;
      pixels[i + 2] = 80;
      pixels[i + 3] = 255;
    }
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 48; x++) {
        const ai = (y * 48 + x) * 4;
        const a = Math.max(alpha[ai], alpha[ai + 1], alpha[ai + 2]) / 255;
        const i = ((432 + y) * 512 + 432 + x) * 4;
        for (let c = 0; c < 3; c++)
          pixels[i + c] = Math.round(pixels[i + c] * (1 - a) + 255 * a);
      }
    }
    const source = new ImageDataShim(pixels, 512, 512) as ImageData;
    const detected = terminal();
    receive({
      data: { type: "detect", jobId: 1, imageData: source },
    } as MessageEvent<GeminiWorkerRequest>);
    const response = await detected;
    expect(response.type, JSON.stringify(response)).toBe("detected");
    if (response.type !== "detected") return;
    expect(response.detection.detected).toBe(true);
    expect(response.detection.region).toEqual({
      x: 432,
      y: 432,
      width: 48,
      height: 48,
    });
    const restored = terminal();
    receive({
      data: {
        type: "process",
        jobId: 2,
        imageData: source,
        detectionHint: response.detection,
      },
    } as MessageEvent<GeminiWorkerRequest>);
    const result = await restored;
    expect(result.type, JSON.stringify(result)).toBe("done");
    if (result.type !== "done") return;
    expect(Array.from(result.imageData.data.slice(0, 4))).toEqual([
      40, 60, 80, 255,
    ]);
    let error = 0;
    for (let y = 432; y < 480; y++)
      for (let x = 432; x < 480; x++) {
        const i = (y * 512 + x) * 4;
        error +=
          Math.abs(result.imageData.data[i] - 40) +
          Math.abs(result.imageData.data[i + 1] - 60) +
          Math.abs(result.imageData.data[i + 2] - 80);
      }
    expect(error / (48 * 48 * 3)).toBeLessThan(4);
    expect(
      runtimeStats.conversions.every(
        ([width, height]) => width <= 288 && height <= 374,
      ),
    ).toBe(true);
    expect(runtimeStats.conversions).toContainEqual([288, 374]);
  }, 20_000);
});
