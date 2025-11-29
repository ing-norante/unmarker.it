import { ProcessingOptions } from './types';

export const DEFAULT_OPTIONS: ProcessingOptions = {
  shake: {
    rotationRange: 0.5,
    scaleRange: [1.01, 1.02],
  },
  stir: {
    noiseAmplitude: 5,
  },
  crush: {
    quality: 0.8,
  },
};

const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

export async function applyShake(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  options: ProcessingOptions['shake'] = DEFAULT_OPTIONS.shake
) {
  const { width, height } = ctx.canvas;
  const { rotationRange, scaleRange } = options!;

  const angleDeg = randomRange(-rotationRange, rotationRange);
  const scale = randomRange(scaleRange[0], scaleRange[1]);
  const angleRad = (angleDeg * Math.PI) / 180;

  // Fill background white
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(angleRad);
  ctx.scale(scale, scale);
  ctx.translate(-width / 2, -height / 2);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);
  ctx.restore();

  await nextTick();
}

export async function applyStir(
  ctx: CanvasRenderingContext2D,
  options: ProcessingOptions['stir'] = DEFAULT_OPTIONS.stir
) {
  const { width, height } = ctx.canvas;
  const { noiseAmplitude } = options!;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    const noiseR = (Math.random() - 0.5) * 2 * noiseAmplitude;
    const noiseG = (Math.random() - 0.5) * 2 * noiseAmplitude;
    const noiseB = (Math.random() - 0.5) * 2 * noiseAmplitude;

    data[i] = Math.min(255, Math.max(0, data[i] + noiseR));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noiseG));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noiseB));
  }

  ctx.putImageData(imageData, 0, 0);
  await nextTick();
}

export async function applyCrush(
  canvas: HTMLCanvasElement,
  options: ProcessingOptions['crush'] = DEFAULT_OPTIONS.crush
): Promise<string> {
  const { quality } = options!;
  return canvas.toDataURL('image/jpeg', quality);
}