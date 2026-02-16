# Unmarker.it

Client-side image post-processing tool built to disrupt invisible AI watermark signals in-browser.

## Project Findings

This README is based on the current code in this repository.

- Processing is fully local in the browser via Canvas (`src/lib/pipeline.ts` + hidden canvas in `src/App.tsx`)
- Input accepts any `image/*`; output is always JPEG via `canvas.toDataURL("image/jpeg", quality)`
- Pipeline steps:
- `shake`: small random rotate/scale affine transform
- `stir`: per-channel Gaussian noise (Box-Muller + typed arrays)
- `crush`: JPEG recompression (default quality `0.85`)
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
pnpm build
```

Current production build output (latest local run):

- `dist/assets/index-*.js` ~414 kB (134 kB gzip)
- `dist/assets/index-*.css` ~41 kB (8 kB gzip)

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

## Project Structure

```text
src/
  App.tsx                 # App state, orchestration, processing flow
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
- Output is always lossy JPEG (original format/metadata are not preserved).
- No automated tests are present in the current repo.

## License

[MIT](LICENSE)
