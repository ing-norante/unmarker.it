import { applyCrush, applyShake, applyStir } from "../lib/pipeline";
import type {
  PixelRequest,
  PixelResponse,
  PixelPhase,
} from "../lib/engine/pixelProtocol";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PixelRequest>) => void) | null;
  postMessage: (message: PixelResponse) => void;
};

scope.onmessage = async ({ data: { bitmap, options } }) => {
  let canvas: OffscreenCanvas | null = null;
  const progress = (phase: PixelPhase) =>
    scope.postMessage({ type: "progress", phase });
  try {
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Could not create pixel worker canvas");
    progress("shake");
    await applyShake(context, bitmap, options.shake);
    bitmap.close();
    progress("stir");
    await applyStir(context, options.stir);
    progress("crush");
    const output = await applyCrush(canvas, options.crush);
    scope.postMessage({ type: "done", output });
  } catch (error) {
    scope.postMessage({
      type: "error",
      reason:
        error instanceof Error ? error.message : "Pixel processing failed",
    });
  } finally {
    bitmap.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
};
