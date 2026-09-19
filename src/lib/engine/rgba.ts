import type { GeminiWatermarkRegion } from "@/lib/types";

export function cropRgba(
  image: ImageData,
  region: GeminiWatermarkRegion,
): ImageData {
  const pixels = new Uint8ClampedArray(region.width * region.height * 4);
  for (let y = 0; y < region.height; y++) {
    const start = ((region.y + y) * image.width + region.x) * 4;
    pixels.set(
      image.data.subarray(start, start + region.width * 4),
      y * region.width * 4,
    );
  }
  return new ImageData(pixels, region.width, region.height);
}
