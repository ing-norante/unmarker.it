import { MAX_MEGAPIXELS } from "@/lib/fileValidation";
import type { ProcessingCanvas, ProcessingContext } from "@/lib/pipeline";
import { abortable, assertNotAborted, createAbortError } from "./abort";

export interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

export class ImageResolutionError extends Error {}

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

export function assertImageDimensions(width: number, height: number) {
  if (width <= 0 || height <= 0) throw new Error("Empty image dimensions");
  if (width * height > MAX_MEGAPIXELS * 1_000_000) {
    throw new ImageResolutionError("Image exceeds processing resolution limit");
  }
}

export async function decodeImage(
  file: Blob,
  signal?: AbortSignal,
): Promise<DecodedImage> {
  assertNotAborted(signal);
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await abortable(createImageBitmap(file), signal, (late) =>
        late.close(),
      );
      try {
        assertImageDimensions(bitmap.width, bitmap.height);
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          release: () => bitmap.close(),
        };
      } catch (error) {
        bitmap.close();
        throw error;
      }
    } catch (error) {
      if (
        signal?.aborted ||
        error instanceof ImageResolutionError ||
        typeof Image === "undefined"
      )
        throw error;
      // Some browsers support a format in <img> but not createImageBitmap.
    }
  }
  return decodeWithImageElement(file, signal);
}

function decodeWithImageElement(
  file: Blob,
  signal?: AbortSignal,
): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    assertNotAborted(signal);
    const image = new Image();
    const url = URL.createObjectURL(file);
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(url);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      image.src = "";
      reject(error);
    };
    const onAbort = () => fail(createAbortError());
    signal?.addEventListener("abort", onAbort, { once: true });
    image.onerror = () => fail(new Error("Failed to decode image"));
    image.onload = () => {
      try {
        assertImageDimensions(image.naturalWidth, image.naturalHeight);
        settled = true;
        cleanup();
        resolve({
          source: image,
          width: image.naturalWidth,
          height: image.naturalHeight,
          release: () => {
            image.src = "";
          },
        });
      } catch (error) {
        fail(error);
      }
    };
    image.src = url;
  });
}
