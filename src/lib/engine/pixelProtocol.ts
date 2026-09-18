import type { ProcessingOptions } from "@/lib/types";

export type PixelPhase = "shake" | "stir" | "crush";
export interface PixelRequest {
  bitmap: ImageBitmap;
  options: ProcessingOptions;
}
export type PixelResponse =
  | { type: "progress"; phase: PixelPhase }
  | { type: "done"; output: Blob }
  | { type: "error"; reason: string };
