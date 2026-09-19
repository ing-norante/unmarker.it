import { getProcessingContext, releaseCanvas } from "../lib/canvas";
import { executePixelPipeline } from "../lib/pixelPipeline";
import type { PixelRequest, PixelResponse } from "../lib/engine/pixelProtocol";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PixelRequest>) => void) | null;
  postMessage: (message: PixelResponse) => void;
};

scope.onmessage = async ({ data: { bitmap, options } }) => {
  let canvas: OffscreenCanvas | null = null;
  let sourceReleased = false;
  const releaseSource = () => {
    if (!sourceReleased) {
      sourceReleased = true;
      bitmap.close();
    }
  };
  try {
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const output = await executePixelPipeline(
      bitmap,
      getProcessingContext(canvas),
      options,
      {
        onPhase: (phase) => scope.postMessage({ type: "progress", phase }),
        onSourceConsumed: releaseSource,
      },
    );
    scope.postMessage({ type: "done", output });
  } catch (error) {
    scope.postMessage({
      type: "error",
      reason:
        error instanceof Error ? error.message : "Pixel processing failed",
    });
  } finally {
    releaseSource();
    if (canvas) releaseCanvas(canvas);
  }
};
