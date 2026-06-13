# Unmarker.it

Client-side image analysis and post-processing tool built to detect local AI provenance signals, disrupt watermark traces in-browser, and verify the generated JPEG output.

## Project Findings

This README is based on the current code in this repository.

- Processing is fully local in the browser via Canvas and a Web Worker (`src/lib/pipeline.ts`, `src/workers/geminiVisible.worker.ts`, and workflow orchestration in `src/hooks/useImageWorkflow.ts`)
- Upload starts a unified workflow: preflight analysis, automatic watermark disruption when the browser can decode the image, postflight verification of the generated JPEG, and download actions
- Preflight analysis reports metadata signals, visible Gemini / Nano Banana watermark detection, hidden watermark risk, and a local AI provenance score based on local evidence only
- Browser-decodable `image/*` files up to 40 megapixels can be processed; PNG, JPEG, WebP, AVIF, HEIF, and JXL files can also run metadata analysis when processing is not available
- Output from the full processing workflow is always JPEG via `canvas.toBlob(..., "image/jpeg", quality)` and an object URL for preview/download
- Pipeline steps after preflight:

1. `Gemini Scan`: detects the visible Gemini / Nano Banana sparkle watermark in the bottom-right corner using local OpenCV.js template matching
2. `Gemini Restore`: when detected, reverses the logo alpha blend and repairs residual sparkle edges with local inpainting; this step is skipped when no mark is detected
3. `shake`: small random rotate/scale affine transform
4. `stir`: per-channel Gaussian noise (streamed Box-Muller samples)
5. `crush`: JPEG recompression (default quality `0.85`)

- Postflight verification scans the generated JPEG again and shows a before/after diff for metadata, visible watermark status, and hidden watermark disruption status
- Metadata-clean original-format downloads are available as a secondary action when the current format supports removable metadata cleanup
- UI stack is React 19 + TypeScript + Tailwind v4 + Radix primitives, built with Rolldown Vite
- App includes PostHog event instrumentation in several components (`src/main.tsx`, `src/components/*`)

## Privacy Notes

- The app code does not upload image files to a backend.
- Analytics events are instrumented through PostHog.
- If `VITE_PUBLIC_POSTHOG_KEY` and `VITE_PUBLIC_POSTHOG_HOST` are configured, usage events may be sent to PostHog.
- Image files and pixel data are still processed locally; PostHog instrumentation is for usage events only.

## Verified Status

Commands run successfully in this repo:

```bash
pnpm lint
pnpm test
pnpm build
```

Current production build output (latest local run):

- `dist/assets/geminiVisible.worker-*.js` ~10.8 MB
- `dist/assets/index-*.js` ~708 kB (220 kB gzip)
- `dist/assets/index-*.css` ~65 kB (11 kB gzip)

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

`VITE_PUBLIC_POSTHOG_HOST` is kept as the default capture endpoint variable.
`VITE_PUBLIC_POSTHOG_API_HOST` and `VITE_PUBLIC_POSTHOG_UI_HOST` are also
supported when the capture and app hosts need to be configured separately.

Without these, image processing still works locally.

## Deployment Notes

The production CSP in `vercel.json` intentionally allows `'unsafe-eval'` and `'wasm-unsafe-eval'` because the OpenCV.js worker used by Gemini Scan creates functions dynamically at runtime. Removing `'unsafe-eval'` will cause Gemini Scan to fail in production with a browser CSP `EvalError`.

Vercel Live is also included in `script-src`, `connect-src`, and `frame-src` so Vercel preview/feedback tooling does not produce CSP noise during production debugging.

## Project Structure

```text
src/
  App.tsx                 # Unified app shell and workflow UI composition
  hooks/
    useImageWorkflow.ts   # Upload -> preflight -> processing -> postflight orchestration
    useUnmarkPipeline.ts  # Local processing pipeline state and JPEG blob output
  workers/
    geminiVisible.worker.ts # Local OpenCV.js Gemini visible watermark detection/restoration
  lib/aiProvenanceScore.ts # Local AI provenance scoring heuristics
  lib/imageAudit.ts       # Preflight/postflight audit composition and verification diff
  lib/geminiShared.ts     # Gemini watermark geometry, confidence, and alpha-blend helpers
  lib/geminiWorkerClient.ts # Worker lifecycle and request/response bridge
  lib/metadataCleaner.ts  # Metadata scan and clean-copy helpers
  lib/pipeline.ts         # Shake / Stir / Crush algorithms
  lib/types.ts            # Workflow, audit, pipeline, and options types
  lib/utils.ts            # Shared utils + output filename generator
  components/
    AnalysisPanel.tsx     # Preflight audit and AI provenance UI
    ImageUploader.tsx     # Drag/drop + file picker
    ActionBar.tsx         # Cancel/reset/retry/reprocess/download controls
    PipelineSteps.tsx     # Step state + progress UI
    ImageComparison.tsx   # Analysis, before/after preview, verification diff
    VerificationDiff.tsx  # Postflight before/after verification summary
    Footer.tsx            # Links + theme toggle + analytics events
```

## Limitations

- This is a heuristic perturbation pipeline, not a guaranteed watermark remover.
- The AI provenance score is based on local metadata and visible watermark evidence; it is not a general-purpose AI image detector and does not prove human or AI authorship.
- Gemini Scan targets the visible Gemini / Nano Banana sparkle mark only.
- Hidden watermark status after processing is "neutralized, not independently verified" because there is no universal local detector for all invisible watermarking systems.
- Input images above 40 megapixels are not processed. Some supported metadata formats may run in analysis-only mode if the browser cannot decode them into canvas pixels.
- Output is always lossy JPEG (original format/metadata are not preserved).
- Metadata-clean original-format downloads are secondary and available only when removable metadata is supported for the input format.

## References

Sources that informed the design of this tool:

- [UnMarker: A Universal Attack on Defensive Image Watermarking](https://arxiv.org/abs/2405.08363) — research background
- [Watermarks offer no defense against deepfakes](https://uwaterloo.ca/news/media/watermarks-offer-no-defense-against-deepfakes) — University of Waterloo coverage

## License

[MIT](LICENSE)
