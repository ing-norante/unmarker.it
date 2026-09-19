import type { ProcessingContext } from "./canvas";
import type { ProcessingOptions } from "./types";
import {
  applyShake,
  applyStir,
  applyCrush,
  GaussianRNG,
  type GaussianNoiseSource,
  type RandomSource,
} from "./pipeline";
import { assertNotAborted } from "./runtime/abort";

export type PixelPhase = "shake" | "stir" | "crush";
export interface PixelExecutionControls {
  signal?: AbortSignal;
  onPhase: (phase: PixelPhase) => void;
  onSourceConsumed?: () => void;
  random?: RandomSource;
  noise?: GaussianNoiseSource;
}

/** One algorithm sequence for worker and main-thread drivers. Drivers own surfaces. */
export async function executePixelPipeline(
  source: CanvasImageSource,
  context: ProcessingContext,
  options: ProcessingOptions,
  controls: PixelExecutionControls,
): Promise<Blob> {
  assertNotAborted(controls.signal);
  controls.onPhase("shake");
  await applyShake(
    context,
    source,
    options.shake,
    controls.signal,
    controls.random,
  );
  assertNotAborted(controls.signal);
  controls.onSourceConsumed?.();
  assertNotAborted(controls.signal);
  controls.onPhase("stir");
  await applyStir(
    context,
    options.stir,
    controls.signal,
    controls.noise ?? new GaussianRNG(controls.random),
  );
  assertNotAborted(controls.signal);
  controls.onPhase("crush");
  const output = await applyCrush(
    context.canvas,
    options.crush,
    controls.signal,
  );
  assertNotAborted(controls.signal);
  return output;
}
