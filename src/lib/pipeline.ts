import type { ProcessingOptions } from "./types";

export const CRUSH_QUALITY_MIN = 0.5;
export const CRUSH_QUALITY_MAX = 0.98;

export const DEFAULT_OPTIONS: ProcessingOptions = {
  shake: {
    rotationRange: 0.5,
    scaleRange: [1.01, 1.02],
  },
  stir: {
    noiseAmplitude: 5,
  },
  crush: {
    quality: 0.85,
  },
};

export type RandomSource = () => number;

export interface GaussianNoiseSource {
  next(mean?: number, stdDev?: number): number;
}

// Gaussian random number generator using the Box-Muller transform.
export class GaussianRNG implements GaussianNoiseSource {
  private spare: number | null = null;
  private hasSpare = false;
  private readonly random: RandomSource;

  constructor(random: RandomSource = Math.random) {
    this.random = random;
  }

  next(mean: number = 0, stdDev: number = 1): number {
    if (this.hasSpare) {
      this.hasSpare = false;
      return this.spare! * stdDev + mean;
    }

    const u1 = Math.max(this.random(), Number.MIN_VALUE);
    const u2 = this.random();
    const mag = Math.sqrt(-2.0 * Math.log(u1));
    const z0 = mag * Math.cos(2.0 * Math.PI * u2);
    const z1 = mag * Math.sin(2.0 * Math.PI * u2);

    this.hasSpare = true;
    this.spare = z1;
    return z0 * stdDev + mean;
  }
}

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

const createAbortError = () => {
  const error = new Error("Processing cancelled");
  error.name = "AbortError";
  return error;
};

const assertNotAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw createAbortError();
  }
};

export async function applyShake(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  options: ProcessingOptions["shake"] = DEFAULT_OPTIONS.shake,
  signal?: AbortSignal,
) {
  assertNotAborted(signal);
  const { width, height } = ctx.canvas;
  const { rotationRange, scaleRange } = options!;

  // More precise: use radians directly, sub-pixel precision
  const angleRad = ((Math.random() * 2 - 1) * (rotationRange * Math.PI)) / 180;
  const scale = scaleRange[0] + Math.random() * (scaleRange[1] - scaleRange[0]);

  // Explicit affine transformation matrix (more mathematically elegant)
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const centerX = width / 2;
  const centerY = height / 2;

  // Fill background white
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);

  // Apply transformation with sub-pixel precision using setTransform
  // This is more precise than chaining translate/rotate/scale
  ctx.save();
  ctx.setTransform(
    scale * cos, // a: horizontal scaling
    scale * sin, // b: vertical skewing
    -scale * sin, // c: horizontal skewing
    scale * cos, // d: vertical scaling
    centerX - centerX * scale * cos + centerY * scale * sin, // e: horizontal translation
    centerY - centerX * scale * sin - centerY * scale * cos, // f: vertical translation
  );

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);
  ctx.restore();

  assertNotAborted(signal);
  await nextTick();
}

export async function applyStir(
  ctx: CanvasRenderingContext2D,
  options: ProcessingOptions["stir"] = DEFAULT_OPTIONS.stir,
  signal?: AbortSignal,
  rng: GaussianNoiseSource = new GaussianRNG(),
) {
  assertNotAborted(signal);
  const { width, height } = ctx.canvas;
  const { noiseAmplitude } = options!;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const pixelCount = width * height;

  // Scale so 3σ is roughly the configured amplitude.
  const stdDev = noiseAmplitude / 3;

  const pixelsPerChunk = 65_536;
  for (
    let pixelStart = 0;
    pixelStart < pixelCount;
    pixelStart += pixelsPerChunk
  ) {
    const pixelEnd = Math.min(pixelStart + pixelsPerChunk, pixelCount);

    for (let pixel = pixelStart; pixel < pixelEnd; pixel++) {
      const i = pixel * 4;
      data[i] = Math.max(0, Math.min(255, data[i] + rng.next(0, stdDev)));
      data[i + 1] = Math.max(
        0,
        Math.min(255, data[i + 1] + rng.next(0, stdDev)),
      );
      data[i + 2] = Math.max(
        0,
        Math.min(255, data[i + 2] + rng.next(0, stdDev)),
      );
      // Alpha channel (i + 3) remains unchanged.
    }

    if (pixelEnd < pixelCount) {
      assertNotAborted(signal);
      await nextTick();
    }
  }

  assertNotAborted(signal);
  ctx.putImageData(imageData, 0, 0);
  await nextTick();
}

export async function applyCrush(
  canvas: HTMLCanvasElement,
  options: ProcessingOptions["crush"] = DEFAULT_OPTIONS.crush,
  signal?: AbortSignal,
): Promise<string> {
  assertNotAborted(signal);
  const { quality } = options!;

  const clampedQuality = Math.max(
    CRUSH_QUALITY_MIN,
    Math.min(CRUSH_QUALITY_MAX, quality),
  );

  try {
    const output = canvas.toDataURL("image/jpeg", clampedQuality);
    assertNotAborted(signal);
    return output;
  } catch (error) {
    // Fallback to default quality if encoding fails
    console.warn("JPEG encoding failed, using default quality", error);
    const output = canvas.toDataURL("image/jpeg", 0.92);
    assertNotAborted(signal);
    return output;
  }
}
