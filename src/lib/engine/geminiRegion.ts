import { getGeminiSearchSize } from "@/lib/geminiShared";
import type { GeminiDetectionResult, GeminiWatermarkRegion } from "@/lib/types";

/** Include the variance reference above the search area and the inpainting margin. */
export function geminiReadRegion(
  width: number,
  height: number,
): GeminiWatermarkRegion {
  const size = getGeminiSearchSize(width, height);
  const x = Math.max(0, width - size - 32);
  const y = Math.max(0, height - size - 118);
  return { x, y, width: width - x, height: height - y };
}

export function offsetDetection(
  detection: GeminiDetectionResult,
  x: number,
  y: number,
): GeminiDetectionResult {
  return {
    ...detection,
    region: {
      ...detection.region,
      x: detection.region.x + x,
      y: detection.region.y + y,
    },
  };
}
