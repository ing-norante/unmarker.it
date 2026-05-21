# Unmarker.it

Client-side image post-processing tool built to disrupt invisible AI watermark signals in-browser.

## Project Findings

This README is based on the current code in this repository.

- Processing is fully local in the browser via Canvas and a Web Worker (`src/lib/pipeline.ts`, `src/workers/geminiVisible.worker.ts`, and hidden canvas orchestration in `src/App.tsx`)
- Input accepts any `image/*`; output is always JPEG via `canvas.toDataURL("image/jpeg", quality)`
- Pipeline steps:

1. `Gemini Scan`: detects and restores the visible Gemini / Nano Banana sparkle watermark in the bottom-right corner using local OpenCV.js template matching and inpainting
2. `shake`: small random rotate/scale affine transform
3. `stir`: per-channel Gaussian noise (Box-Muller + typed arrays)
4. `crush`: JPEG recompression (default quality `0.85`)

- UI stack is React 19 + TypeScript + Tailwind v4 + Radix primitives, built with Rolldown Vite
- App includes PostHog event instrumentation in several components (`src/main.tsx`, `src/components/*`)

## Privacy Notes

- The app code does not upload image files to a backend.
- Analytics events are instrumented through PostHog.
- If `VITE_PUBLIC_POSTHOG_KEY` and `VITE_PUBLIC_POSTHOG_HOST` are configured, usage events may be sent to PostHog.

## Verified Status

Commands run successfully in this repo:

```bash
pnpm lint
pnpm test
pnpm build
```

Current production build output (latest local run):

- `dist/assets/geminiVisible.worker-*.js` ~10.8 MB
- `dist/assets/index-*.js` ~437 kB (141 kB gzip)
- `dist/assets/index-*.css` ~44 kB (8 kB gzip)

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm

### Install and Run

```bash
pnpm install
pnpm dev
```

### Build and Preview

```bash
pnpm build
pnpm preview
```

## Environment Variables

Optional analytics configuration:

```bash
VITE_PUBLIC_POSTHOG_KEY=...
VITE_PUBLIC_POSTHOG_HOST=...
```

Without these, image processing still works locally.

## Deployment Notes

The production CSP in `vercel.json` intentionally allows `'unsafe-eval'` and `'wasm-unsafe-eval'` because the OpenCV.js worker used by Gemini Scan creates functions dynamically at runtime. Removing `'unsafe-eval'` will cause Gemini Scan to fail in production with a browser CSP `EvalError`.

Vercel Live is also included in `script-src`, `connect-src`, and `frame-src` so Vercel preview/feedback tooling does not produce CSP noise during production debugging.

## Project Structure

```text
src/
  App.tsx                 # App state, orchestration, processing flow
  workers/
    geminiVisible.worker.ts # Local OpenCV.js Gemini visible watermark detection/restoration
  lib/geminiShared.ts     # Gemini watermark geometry, confidence, and alpha-blend helpers
  lib/geminiWorkerClient.ts # Worker lifecycle and request/response bridge
  lib/pipeline.ts         # Shake / Stir / Crush algorithms
  lib/types.ts            # Pipeline and options types
  lib/utils.ts            # Shared utils + output filename generator
  components/
    ImageUploader.tsx     # Drag/drop + file picker
    ActionBar.tsx         # Reset/process controls
    PipelineSteps.tsx     # Step state + progress UI
    ImageComparison.tsx   # Before/after preview + download
    Footer.tsx            # Links + theme toggle + analytics events
```

## Limitations

- This is a heuristic perturbation pipeline, not a guaranteed watermark remover.
- Gemini Scan targets the visible Gemini / Nano Banana sparkle mark only; it does not guarantee removal of invisible provenance or watermarking systems.
- Output is always lossy JPEG (original format/metadata are not preserved).
- Automated tests currently cover shared Gemini watermark helpers.

## License

[MIT](LICENSE)
