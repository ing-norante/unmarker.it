import type { ProcessingOptions } from "@/lib/types";

import type { PixelPhase } from "../pixelPipeline";
export type { PixelPhase } from "../pixelPipeline";
export interface PixelRequest {
  bitmap: ImageBitmap;
  options: ProcessingOptions;
}
export type PixelResponse =
  | { type: "progress"; phase: PixelPhase }
  | { type: "done"; output: Blob }
  | { type: "error"; reason: string };
