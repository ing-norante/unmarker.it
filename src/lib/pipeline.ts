import type { ProcessingOptions } from "./types";

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

// Gaussian random number generator using Box-Muller transform
// More elegant and natural than uniform noise
class GaussianRNG {
  private spare: number | null = null;
  private hasSpare = false;

  next(mean: number = 0, stdDev: number = 1): number {
    if (this.hasSpare) {
      this.hasSpare = false;
      return this.spare! * stdDev + mean;
    }

    const u1 = Math.random();
    const u2 = Math.random();
    const mag = stdDev * Math.sqrt(-2.0 * Math.log(u1));
    const z0 = mag * Math.cos(2.0 * Math.PI * u2);
    const z1 = mag * Math.sin(2.0 * Math.PI * u2);

    this.hasSpare = true;
    this.spare = z1;
    return z0 * stdDev + mean;
  }
}

// Batch random number generator for better performance
function generateGaussianBatch(size: number, stdDev: number): Float32Array {
  const rng = new GaussianRNG();
  const batch = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    batch[i] = rng.next(0, stdDev);
  }
  return batch;
}

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

export async function applyShake(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  options: ProcessingOptions["shake"] = DEFAULT_OPTIONS.shake
) {
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
    centerY - centerX * scale * sin - centerY * scale * cos // f: vertical translation
  );

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);
  ctx.restore();

  await nextTick();
}

export async function applyStir(
  ctx: CanvasRenderingContext2D,
  options: ProcessingOptions["stir"] = DEFAULT_OPTIONS.stir
) {
  const { width, height } = ctx.canvas;
  const { noiseAmplitude } = options!;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const pixelCount = width * height;

  // Pre-generate Gaussian noise in batches for better performance
  // Use noiseAmplitude as standard deviation for Gaussian distribution
  // Scale so 3σ ≈ amplitude (covers 99.7% of values)
  const stdDev = noiseAmplitude / 3;
  const noiseR = generateGaussianBatch(pixelCount, stdDev);
  const noiseG = generateGaussianBatch(pixelCount, stdDev);
  const noiseB = generateGaussianBatch(pixelCount, stdDev);

  // Optimized loop: process all channels in one pass
  let noiseIdx = 0;
  for (let i = 0; i < data.length; i += 4) {
    // Clamp with proper bounds checking
    data[i] = Math.max(0, Math.min(255, data[i] + noiseR[noiseIdx]));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noiseG[noiseIdx]));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noiseB[noiseIdx]));
    // Alpha channel (i + 3) remains unchanged
    noiseIdx++;
  }

  ctx.putImageData(imageData, 0, 0);
  await nextTick();
}

export async function applyCrush(
  canvas: HTMLCanvasElement,
  options: ProcessingOptions["crush"] = DEFAULT_OPTIONS.crush
): Promise<string> {
  const { quality } = options!;

  // Clamp quality to valid range
  const clampedQuality = Math.max(0, Math.min(1, quality));

  try {
    return canvas.toDataURL("image/jpeg", clampedQuality);
  } catch (error) {
    // Fallback to default quality if encoding fails
    console.warn("JPEG encoding failed, using default quality", error);
    return canvas.toDataURL("image/jpeg", 0.92);
  }
}
