import type { GeminiDetectionResult, GeminiWatermarkRegion } from "./types";

export type GeminiWatermarkSize = "small" | "large";

export interface GeminiWatermarkConfig {
  size: GeminiWatermarkSize;
  marginRight: number;
  marginBottom: number;
  logoSize: number;
}

export interface RgbaImageDataLike {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export const GEMINI_DETECTION_THRESHOLD = 0.35;
export const GEMINI_SPATIAL_EARLY_EXIT_THRESHOLD = 0.25;

export const DEFAULT_GEMINI_DETECTION: GeminiDetectionResult = {
  detected: false,
  confidence: 0,
  region: { x: 0, y: 0, width: 0, height: 0 },
  spatialScore: 0,
  gradientScore: 0,
  varianceScore: 0,
};

export function getGeminiWatermarkConfig(
  width: number,
  height: number,
): GeminiWatermarkConfig {
  if (width > 1024 && height > 1024) {
    return {
      size: "large",
      marginRight: 64,
      marginBottom: 64,
      logoSize: 96,
    };
  }

  return {
    size: "small",
    marginRight: 32,
    marginBottom: 32,
    logoSize: 48,
  };
}

export function getGeminiWatermarkPosition(
  imageWidth: number,
  imageHeight: number,
  config = getGeminiWatermarkConfig(imageWidth, imageHeight),
): GeminiWatermarkRegion {
  return {
    x: imageWidth - config.marginRight - config.logoSize,
    y: imageHeight - config.marginBottom - config.logoSize,
    width: config.logoSize,
    height: config.logoSize,
  };
}

export function getGeminiSearchSize(width: number, height: number) {
  return Math.trunc(Math.min(width, height, 256));
}

export function fuseGeminiConfidence(
  spatialScore: number,
  gradientScore: number,
  varianceScore: number,
) {
  return clamp01(
    spatialScore * 0.5 + gradientScore * 0.3 + varianceScore * 0.2,
  );
}

export function isGeminiDetectionPositive(confidence: number) {
  return confidence >= GEMINI_DETECTION_THRESHOLD;
}

export function reverseAlphaBlendRgba(
  imageData: RgbaImageDataLike,
  alphaMap: Float32Array,
  region: GeminiWatermarkRegion,
  options: {
    alphaThreshold?: number;
    maxAlpha?: number;
    logoValue?: number;
  } = {},
) {
  const alphaThreshold = options.alphaThreshold ?? 0.002;
  const maxAlpha = options.maxAlpha ?? 0.99;
  const logoValue = options.logoValue ?? 255;
  const { data, width, height } = imageData;

  for (let ay = 0; ay < region.height; ay++) {
    const y = region.y + ay;
    if (y < 0 || y >= height) continue;

    for (let ax = 0; ax < region.width; ax++) {
      const x = region.x + ax;
      if (x < 0 || x >= width) continue;

      const alphaIndex = ay * region.width + ax;
      const rawAlpha = alphaMap[alphaIndex] ?? 0;
      if (rawAlpha < alphaThreshold) continue;

      const alpha = Math.min(maxAlpha, Math.max(0, rawAlpha));
      const oneMinusAlpha = 1 - alpha;
      const pixelIndex = (y * width + x) * 4;

      data[pixelIndex] = clampByte(
        (data[pixelIndex] - alpha * logoValue) / oneMinusAlpha,
      );
      data[pixelIndex + 1] = clampByte(
        (data[pixelIndex + 1] - alpha * logoValue) / oneMinusAlpha,
      );
      data[pixelIndex + 2] = clampByte(
        (data[pixelIndex + 2] - alpha * logoValue) / oneMinusAlpha,
      );
    }
  }
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
