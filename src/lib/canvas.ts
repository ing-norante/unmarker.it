export type ProcessingCanvas = HTMLCanvasElement | OffscreenCanvas;
export type ProcessingContext =
  CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function createProcessingCanvas(
  width: number,
  height: number,
): ProcessingCanvas {
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(width, height)
      : document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function getProcessingContext(
  canvas: ProcessingCanvas,
): ProcessingContext {
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  }) as ProcessingContext | null;
  if (!context) throw new Error("Could not create image canvas");
  return context;
}

export function releaseCanvas(canvas: ProcessingCanvas) {
  canvas.width = 0;
  canvas.height = 0;
}
