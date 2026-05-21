import * as cvRuntime from "@techstark/opencv-js";
import {
  DEFAULT_GEMINI_DETECTION,
  GEMINI_SPATIAL_EARLY_EXIT_THRESHOLD,
  fuseGeminiConfidence,
  getGeminiSearchSize,
  isGeminiDetectionPositive,
  reverseAlphaBlendRgba,
} from "../lib/geminiShared";
import type {
  GeminiDetectionResult,
  GeminiWatermarkRegion,
  GeminiWorkerProgressStage,
  GeminiWorkerRequest,
  GeminiWorkerResponse,
} from "../lib/types";

type CvMat = {
  rows: number;
  cols: number;
  data: Uint8Array;
  data32F: Float32Array;
  data64F: Float64Array;
  delete: () => void;
  convertTo: (dst: CvMat, type: number, alpha?: number, beta?: number) => void;
  roi: (rect: CvRect) => CvMat;
};

type CvRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CvSize = {
  width: number;
  height: number;
};

type CvMinMaxLoc = {
  minVal: number;
  maxVal: number;
  minLoc: { x: number; y: number };
  maxLoc: { x: number; y: number };
};

type Cv = {
  calledRun?: boolean;
  onRuntimeInitialized?: () => void;
  Mat: {
    new (rows?: number, cols?: number, type?: number): CvMat;
    zeros: (rows: number, cols: number, type: number) => CvMat;
  };
  Rect: new (x: number, y: number, width: number, height: number) => CvRect;
  Size: new (width: number, height: number) => CvSize;
  matFromImageData: (imageData: ImageData) => CvMat;
  cvtColor: (src: CvMat, dst: CvMat, code: number) => void;
  resize: (
    src: CvMat,
    dst: CvMat,
    dsize: CvSize,
    fx?: number,
    fy?: number,
    interpolation?: number,
  ) => void;
  matchTemplate: (
    image: CvMat,
    templ: CvMat,
    result: CvMat,
    method: number,
  ) => void;
  minMaxLoc: (mat: CvMat) => CvMinMaxLoc;
  Sobel: (
    src: CvMat,
    dst: CvMat,
    ddepth: number,
    dx: number,
    dy: number,
    ksize?: number,
  ) => void;
  magnitude: (x: CvMat, y: CvMat, magnitude: CvMat) => void;
  meanStdDev: (src: CvMat, mean: CvMat, stddev: CvMat) => void;
  getStructuringElement: (shape: number, ksize: CvSize) => CvMat;
  dilate: (src: CvMat, dst: CvMat, kernel: CvMat) => void;
  inpaint: (
    src: CvMat,
    inpaintMask: CvMat,
    dst: CvMat,
    inpaintRadius: number,
    flags: number,
  ) => void;
  matFromArray: (
    rows: number,
    cols: number,
    type: number,
    array: ArrayLike<number>,
  ) => CvMat;
  COLOR_RGBA2GRAY: number;
  COLOR_RGBA2RGB: number;
  CV_8UC1: number;
  CV_32F: number;
  CV_32FC1: number;
  INTER_AREA: number;
  INTER_LINEAR: number;
  TM_CCOEFF_NORMED: number;
  MORPH_ELLIPSE: number;
  INPAINT_NS: number;
};

type OpenCvRuntime = Partial<Cv> & {
  default?: Partial<Cv>;
  cv?: Partial<Cv>;
  "module.exports"?: Partial<Cv>;
};

interface AlphaMap {
  width: number;
  height: number;
  data: Float32Array;
}

type WorkerContext = {
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<GeminiWorkerRequest>) => void,
  ) => void;
  postMessage: (
    message: GeminiWorkerResponse,
    transfer: Transferable[],
  ) => void;
  setTimeout: (callback: () => void, delay: number) => number;
};

const ctx = self as unknown as WorkerContext;

let cvPromise: Promise<Cv> | null = null;
let alphaMapsPromise: Promise<{ small: AlphaMap; large: AlphaMap }> | null =
  null;

ctx.addEventListener("message", (event: MessageEvent<GeminiWorkerRequest>) => {
  void handleMessage(event.data);
});

async function handleMessage(message: GeminiWorkerRequest) {
  if (message.type !== "process") return;

  try {
    postProgress(message.jobId, "loading-opencv");
    const cv = await loadOpenCv();
    assertOpenCvCapabilities(cv);

    postProgress(message.jobId, "loading-alpha");
    const alphaMaps = await loadAlphaMaps();

    postProgress(message.jobId, "detecting");
    const detection = detectGeminiWatermark(cv, message.imageData, alphaMaps);

    if (!detection.detected) {
      postProgress(message.jobId, "skipped");
      postImageResponse("skipped", message.jobId, detection, message.imageData);
      return;
    }

    postProgress(message.jobId, "restoring");
    const sourceAlpha = pickAlphaMapForSize(alphaMaps, detection.region.width);
    const alpha = resizeAlphaData(
      cv,
      sourceAlpha,
      detection.region.width,
      detection.region.height,
    );
    reverseAlphaBlendRgba(message.imageData, alpha, detection.region);

    postProgress(message.jobId, "inpainting");
    inpaintResidual(cv, message.imageData, sourceAlpha, detection.region);

    postProgress(message.jobId, "done");
    postImageResponse("done", message.jobId, detection, message.imageData);
  } catch (error) {
    postError(
      message.jobId,
      error instanceof Error ? error.message : "Gemini worker failed",
    );
  }
}

function loadOpenCv() {
  if (cvPromise) return cvPromise;

  cvPromise = new Promise<Cv>((resolve, reject) => {
    const runtime = resolveOpenCvRuntime();

    const finish = () => {
      try {
        const cv = runtime as Cv;
        assertOpenCvCapabilities(cv);
        resolve(resolveWithoutThenableTrap(cv));
      } catch (error) {
        reject(error);
      }
    };

    if (runtime.calledRun && typeof runtime.matchTemplate === "function") {
      finish();
      return;
    }

    const previous = runtime.onRuntimeInitialized;
    runtime.onRuntimeInitialized = () => {
      previous?.();
      finish();
    };

    windowlessTimeout(() => {
      if (runtime.calledRun && typeof runtime.matchTemplate === "function") {
        finish();
      } else {
        reject(new Error("OpenCV.js did not initialize in time"));
      }
    }, 15_000);
  });

  return cvPromise;
}

function resolveWithoutThenableTrap(cv: Cv) {
  const runtime = cv as Cv & { then?: unknown };
  if (typeof runtime.then === "function") {
    try {
      runtime.then = undefined;
    } catch {
      Object.defineProperty(runtime, "then", {
        configurable: true,
        value: undefined,
      });
    }
  }
  return cv;
}

function resolveOpenCvRuntime() {
  const runtime = cvRuntime as unknown as OpenCvRuntime;
  return runtime.default ?? runtime.cv ?? runtime["module.exports"] ?? runtime;
}

function assertOpenCvCapabilities(cv: Partial<Cv>) {
  const missing = [
    "matchTemplate",
    "inpaint",
    "Sobel",
    "resize",
    "dilate",
    "minMaxLoc",
    "matFromImageData",
  ].filter((key) => typeof cv[key as keyof Cv] !== "function");

  if (missing.length > 0) {
    throw new Error(`OpenCV.js is missing: ${missing.join(", ")}`);
  }
}

function loadAlphaMaps() {
  if (alphaMapsPromise) return alphaMapsPromise;

  alphaMapsPromise = Promise.all([
    loadAlphaMap("/gemini/gemini_bg_48.png"),
    loadAlphaMap("/gemini/gemini_bg_96.png"),
  ]).then(([small, large]) => ({ small, large }));

  return alphaMapsPromise;
}

async function loadAlphaMap(path: string): Promise<AlphaMap> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }

  const bitmap = await createImageBitmap(await response.blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const canvasCtx = canvas.getContext("2d", { willReadFrequently: true });
  if (!canvasCtx) {
    bitmap.close();
    throw new Error("Could not decode Gemini alpha map");
  }

  canvasCtx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const { data, width, height } = canvasCtx.getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const alpha = new Float32Array(width * height);

  for (let pixel = 0; pixel < alpha.length; pixel++) {
    const i = pixel * 4;
    alpha[pixel] = Math.max(data[i], data[i + 1], data[i + 2]) / 255;
  }

  return { width, height, data: alpha };
}

function detectGeminiWatermark(
  cv: Cv,
  imageData: ImageData,
  alphaMaps: { small: AlphaMap; large: AlphaMap },
): GeminiDetectionResult {
  if (imageData.width <= 0 || imageData.height <= 0) {
    return createDefaultDetection();
  }

  const imageWidth = imageData.width;
  const imageHeight = imageData.height;
  const searchSize = getGeminiSearchSize(imageWidth, imageHeight);
  const sx1 = Math.max(0, imageWidth - searchSize);
  const sy1 = Math.max(0, imageHeight - searchSize);

  const mats: CvMat[] = [];

  try {
    const rgba = track(mats, cv.matFromImageData(imageData));
    const gray = track(mats, new cv.Mat());
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);

    const gray32 = track(mats, new cv.Mat());
    gray.convertTo(gray32, cv.CV_32F, 1 / 255);

    const searchRegion = track(
      mats,
      gray32.roi(new cv.Rect(sx1, sy1, searchSize, searchSize)),
    );

    let bestScale = 0;
    let bestScore = -1;
    let bestRawNcc = -1;
    let bestLoc = { x: 0, y: 0 };

    for (let scale = 16; scale < 120; scale += 2) {
      if (scale > searchRegion.rows || scale > searchRegion.cols) continue;

      const sourceAlpha = pickAlphaMapForSize(alphaMaps, scale);
      const template = track(
        mats,
        alphaMapToMat(cv, sourceAlpha, scale, scale),
      );
      const match = track(mats, new cv.Mat());
      cv.matchTemplate(searchRegion, template, match, cv.TM_CCOEFF_NORMED);
      const { maxVal, maxLoc } = cv.minMaxLoc(match);
      const weightedScore = maxVal * Math.min(1, Math.sqrt(scale / 96));

      if (weightedScore > bestScore) {
        bestScore = weightedScore;
        bestScale = scale;
        bestRawNcc = maxVal;
        bestLoc = maxLoc;
      }
    }

    if (bestScale <= 0) {
      return createDefaultDetection();
    }

    const region = {
      x: sx1 + bestLoc.x,
      y: sy1 + bestLoc.y,
      width: bestScale,
      height: bestScale,
    };

    if (bestRawNcc < GEMINI_SPATIAL_EARLY_EXIT_THRESHOLD) {
      return {
        detected: false,
        confidence: Math.max(0, bestRawNcc * 0.5),
        region,
        spatialScore: bestRawNcc,
        gradientScore: 0,
        varianceScore: 0,
      };
    }

    const grayRegion = track(
      mats,
      gray32.roi(new cv.Rect(region.x, region.y, region.width, region.height)),
    );
    const grayRegionU8 = track(
      mats,
      gray.roi(new cv.Rect(region.x, region.y, region.width, region.height)),
    );
    const alphaRegion = track(
      mats,
      alphaMapToMat(
        cv,
        pickAlphaMapForSize(alphaMaps, region.width),
        region.width,
        region.height,
      ),
    );

    const gradientScore = calculateGradientScore(
      cv,
      mats,
      grayRegion,
      alphaRegion,
    );
    const varianceScore = calculateVarianceScore(
      cv,
      mats,
      gray,
      grayRegionU8,
      region,
    );
    const confidence = fuseGeminiConfidence(
      bestRawNcc,
      gradientScore,
      varianceScore,
    );

    return {
      detected: isGeminiDetectionPositive(confidence),
      confidence,
      region,
      spatialScore: bestRawNcc,
      gradientScore,
      varianceScore,
    };
  } finally {
    deleteMats(mats);
  }
}

function pickAlphaMapForSize(
  alphaMaps: { small: AlphaMap; large: AlphaMap },
  targetSize: number,
) {
  return targetSize <= 64 ? alphaMaps.small : alphaMaps.large;
}

function calculateGradientScore(
  cv: Cv,
  mats: CvMat[],
  grayRegion: CvMat,
  alphaRegion: CvMat,
) {
  const imgGx = track(mats, new cv.Mat());
  const imgGy = track(mats, new cv.Mat());
  const imgMag = track(mats, new cv.Mat());
  const alphaGx = track(mats, new cv.Mat());
  const alphaGy = track(mats, new cv.Mat());
  const alphaMag = track(mats, new cv.Mat());
  const match = track(mats, new cv.Mat());

  cv.Sobel(grayRegion, imgGx, cv.CV_32F, 1, 0, 3);
  cv.Sobel(grayRegion, imgGy, cv.CV_32F, 0, 1, 3);
  cv.magnitude(imgGx, imgGy, imgMag);

  cv.Sobel(alphaRegion, alphaGx, cv.CV_32F, 1, 0, 3);
  cv.Sobel(alphaRegion, alphaGy, cv.CV_32F, 0, 1, 3);
  cv.magnitude(alphaGx, alphaGy, alphaMag);

  cv.matchTemplate(imgMag, alphaMag, match, cv.TM_CCOEFF_NORMED);
  return cv.minMaxLoc(match).maxVal;
}

function calculateVarianceScore(
  cv: Cv,
  mats: CvMat[],
  gray: CvMat,
  grayRegionU8: CvMat,
  region: GeminiWatermarkRegion,
) {
  const refHeight = Math.min(region.y, region.height);
  if (refHeight <= 8) return 0;

  const refRegion = track(
    mats,
    gray.roi(
      new cv.Rect(region.x, region.y - refHeight, region.width, refHeight),
    ),
  );
  const wmMean = track(mats, new cv.Mat());
  const wmStd = track(mats, new cv.Mat());
  const refMean = track(mats, new cv.Mat());
  const refStd = track(mats, new cv.Mat());

  cv.meanStdDev(grayRegionU8, wmMean, wmStd);
  cv.meanStdDev(refRegion, refMean, refStd);

  const wmStdValue = readFirstNumber(wmStd);
  const refStdValue = readFirstNumber(refStd);

  if (refStdValue <= 5) return 0;
  return Math.max(0, Math.min(1, 1 - wmStdValue / refStdValue));
}

function resizeAlphaData(
  cv: Cv,
  alpha: AlphaMap,
  width: number,
  height: number,
) {
  const mat = alphaMapToMat(cv, alpha, width, height);
  const data = new Float32Array(mat.data32F);
  mat.delete();
  return data;
}

function alphaMapToMat(cv: Cv, alpha: AlphaMap, width: number, height: number) {
  const src = cv.matFromArray(
    alpha.height,
    alpha.width,
    cv.CV_32FC1,
    alpha.data,
  );
  if (width === alpha.width && height === alpha.height) {
    return src;
  }

  const dst = new cv.Mat();
  const interpolation =
    width > alpha.width || height > alpha.height
      ? cv.INTER_LINEAR
      : cv.INTER_AREA;
  cv.resize(src, dst, new cv.Size(width, height), 0, 0, interpolation);
  src.delete();
  return dst;
}

function inpaintResidual(
  cv: Cv,
  imageData: ImageData,
  sourceAlpha: AlphaMap,
  region: GeminiWatermarkRegion,
) {
  if (region.width < 4 || region.height < 4) return;

  const strength = 0.85;
  const padding = 32;
  const inpaintRadius = 10;
  const px1 = Math.max(0, region.x - padding);
  const py1 = Math.max(0, region.y - padding);
  const px2 = Math.min(imageData.width, region.x + region.width + padding);
  const py2 = Math.min(imageData.height, region.y + region.height + padding);
  const paddedWidth = px2 - px1;
  const paddedHeight = py2 - py1;

  if (paddedWidth < 8 || paddedHeight < 8) return;

  const mats: CvMat[] = [];

  try {
    const gradWeight = makeGradientWeight(
      cv,
      mats,
      sourceAlpha,
      region.width,
      region.height,
    );
    if (!gradWeight) return;

    const rgba = track(mats, cv.matFromImageData(imageData));
    const rgb = track(mats, new cv.Mat());
    cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);

    const paddedRoi = track(
      mats,
      rgb.roi(new cv.Rect(px1, py1, paddedWidth, paddedHeight)),
    );
    const mask = track(
      mats,
      cv.Mat.zeros(paddedHeight, paddedWidth, cv.CV_8UC1),
    );
    const innerX = region.x - px1;
    const innerY = region.y - py1;

    for (let y = 0; y < region.height; y++) {
      for (let x = 0; x < region.width; x++) {
        const weight = gradWeight[y * region.width + x];
        if (weight * 255 > 30) {
          mask.data[(innerY + y) * paddedWidth + innerX + x] = 255;
        }
      }
    }

    const inpainted = track(mats, new cv.Mat());
    cv.inpaint(paddedRoi, mask, inpainted, inpaintRadius, cv.INPAINT_NS);

    blendInpaintedRegion(imageData, inpainted, gradWeight, region, {
      paddedWidth,
      innerX,
      innerY,
      strength,
    });
  } finally {
    deleteMats(mats);
  }
}

function makeGradientWeight(
  cv: Cv,
  mats: CvMat[],
  sourceAlpha: AlphaMap,
  width: number,
  height: number,
) {
  const alpha = track(mats, alphaMapToMat(cv, sourceAlpha, width, height));
  const gx = track(mats, new cv.Mat());
  const gy = track(mats, new cv.Mat());
  const mag = track(mats, new cv.Mat());

  cv.Sobel(alpha, gx, cv.CV_32F, 1, 0, 3);
  cv.Sobel(alpha, gy, cv.CV_32F, 0, 1, 3);
  cv.magnitude(gx, gy, mag);

  const { minVal, maxVal } = cv.minMaxLoc(mag);
  if (maxVal <= minVal) return null;

  const weights = new Float32Array(width * height);
  const range = maxVal - minVal;
  for (let i = 0; i < weights.length; i++) {
    weights[i] = Math.sqrt((mag.data32F[i] - minVal) / range);
  }

  const weightMat = track(mats, new cv.Mat(height, width, cv.CV_32FC1));
  weightMat.data32F.set(weights);
  const kernel = track(
    mats,
    cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5)),
  );
  const dilated = track(mats, new cv.Mat());
  cv.dilate(weightMat, dilated, kernel);

  return new Float32Array(dilated.data32F);
}

function blendInpaintedRegion(
  imageData: ImageData,
  inpainted: CvMat,
  gradWeight: Float32Array,
  region: GeminiWatermarkRegion,
  options: {
    paddedWidth: number;
    innerX: number;
    innerY: number;
    strength: number;
  },
) {
  const { data, width } = imageData;

  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const imageX = region.x + x;
      const imageY = region.y + y;
      if (
        imageX < 0 ||
        imageX >= imageData.width ||
        imageY < 0 ||
        imageY >= imageData.height
      ) {
        continue;
      }

      const weight = gradWeight[y * region.width + x] * options.strength;
      if (weight <= 0) continue;

      const imageIndex = (imageY * width + imageX) * 4;
      const inpaintIndex =
        ((options.innerY + y) * options.paddedWidth + options.innerX + x) * 3;

      data[imageIndex] = blendByte(
        data[imageIndex],
        inpainted.data[inpaintIndex],
        weight,
      );
      data[imageIndex + 1] = blendByte(
        data[imageIndex + 1],
        inpainted.data[inpaintIndex + 1],
        weight,
      );
      data[imageIndex + 2] = blendByte(
        data[imageIndex + 2],
        inpainted.data[inpaintIndex + 2],
        weight,
      );
    }
  }
}

function blendByte(source: number, target: number, weight: number) {
  return Math.max(
    0,
    Math.min(255, Math.round(source * (1 - weight) + target * weight)),
  );
}

function track<T extends CvMat>(mats: CvMat[], mat: T) {
  mats.push(mat);
  return mat;
}

function deleteMats(mats: CvMat[]) {
  for (let i = mats.length - 1; i >= 0; i--) {
    mats[i].delete();
  }
}

function createDefaultDetection(): GeminiDetectionResult {
  return {
    ...DEFAULT_GEMINI_DETECTION,
    region: { ...DEFAULT_GEMINI_DETECTION.region },
  };
}

function readFirstNumber(mat: CvMat) {
  return mat.data64F?.[0] ?? mat.data32F?.[0] ?? 0;
}

function postProgress(jobId: number, stage: GeminiWorkerProgressStage) {
  postMessageToMain({ type: "progress", jobId, stage });
}

function postImageResponse(
  type: "done" | "skipped",
  jobId: number,
  detection: GeminiDetectionResult,
  imageData: ImageData,
) {
  postMessageToMain({ type, jobId, detection, imageData }, [
    imageData.data.buffer,
  ]);
}

function postError(jobId: number, message: string) {
  postMessageToMain({ type: "error", jobId, message });
}

function postMessageToMain(
  message: GeminiWorkerResponse,
  transfer?: Transferable[],
) {
  ctx.postMessage(message, transfer ?? []);
}

function windowlessTimeout(callback: () => void, delay: number) {
  ctx.setTimeout(callback, delay);
}
