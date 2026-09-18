# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary audience is everyday users cleaning AI-generated images for personal use, confirmed by the product owner during initialization.

Research, robustness testing, and education appear in existing copy, but are not the primary audience.

## Product Purpose

Unmarker.it helps people analyze local image provenance signals, process watermark traces, inspect the result, and download a cleaned image in their browser.

The current workflow takes a selected image through analysis, automatic processing when supported, and a second scan of the generated JPEG. Completion means an output is available with an explanation of the observed changes and the limits of verification.

## Positioning

The implemented product combines local metadata inspection, targeted restoration of the visible Gemini / Nano Banana sparkle mark, heuristic disruption of hidden watermark signals, and before/after checks in one browser workflow. Image processing does not require an account or an image-processing backend.

This describes the current mechanism, not a claim of unique technology or guaranteed watermark removal.

## Operating Context

- Users choose or drag in one or more images from their device. The app starts the workflow automatically.
- Users inspect analysis and before/after results, download the processed JPEG, adjust JPEG quality and reprocess, or reset to select another image.
- Supported inputs can remain in analysis-only mode when browser decoding or processing is unavailable. Metadata-clean downloads in the original format are a secondary action where supported.
- The interface supports English at `/` and Simplified Chinese at `/zh-hans/`.
- Processing uses browser Canvas APIs and an OpenCV.js Web Worker. Browser decoding support determines which images can be processed.
- The existing application uses React, TypeScript, Vite, Tailwind CSS, and Radix primitives; dependency details live in `package.json`.

## Capabilities and Constraints

### Current implementation

- A sequential local queue supports pause, per-image cancellation and retry, individual JPEG downloads and ZIP export with a local report. Queue retention limits are 20 files, 200 MiB inputs and 128 MiB outputs; they do not bound total browser memory.
- Local C2PA reading separates declared origin, integrity and unknown signer trust. Remote manifests and online verification are disabled.

- Image files and pixels are processed locally. Configured PostHog instrumentation can send usage and error events; local image processing must not be described as an absence of all network activity.
- Input size is limited to 25 MB, and pixel processing is limited to 40 megapixels (`src/lib/fileValidation.ts`).
- Browser-readable images can be processed. PNG, JPEG, WebP, AVIF, HEIF, and JXL have metadata-analysis support; metadata support does not guarantee pixel decoding.
- Gemini Scan targets the visible Gemini / Nano Banana sparkle watermark. Gemini Restore runs when that mark is detected.
- Shake applies a small geometric transform, Stir adds noise, and Crush recompresses to JPEG. These steps can change image quality; the main output is lossy JPEG.
- Categorical origin evidence uses local metadata and visible-mark evidence; C2PA presence alone is not AI evidence. It is not a general AI-image detector or proof of authorship.
- Postflight checks rescan the generated JPEG. Hidden-watermark disruption is not independently verified: no universal local detector proves removal.
- Existing pipeline terms are Gemini Scan, Gemini Restore, Shake, Stir, Crush, preflight analysis, and postflight verification.

### Open decisions

- Whether the current local-only processing, account-free access, workflow, and supported languages are binding long-term commitments remains unconfirmed.
- No additional product-specific accessibility standard or browser support matrix was established during initialization.

## Brand Commitments

The existing product name is **Unmarker.it**. Existing interface copy emphasizes image privacy and the sequence “Analyze, remove, and verify.” No new voice or visual direction was established during initialization.

## Evidence on Hand

- `README.md` describes the workflow, privacy boundaries, and technical limitations. Current implementation takes precedence where it has evolved beyond the README.
- `src/lib/engine/`, `src/lib/batch/`, `src/lib/pipeline.ts`, and `src/workers/geminiVisible.worker.ts` implement the processing workflow.
- `src/lib/imageAudit.ts` and `src/lib/aiProvenanceScore.ts` define the local evidence and verification logic.
- `src/i18n/resources/en/` and `src/i18n/resources/zh-Hans/` contain existing product copy; `src/i18n/locales.ts` defines localized routes.
- `public/favicon.svg`, the app icons, and `public/og-image*.png` provide existing brand assets.
- The README links research background; these references are not independent validation of this implementation. Research files alone do not establish a product performance claim.
- No testimonials, customer counts, endorsements, or independently verified removal rates were established in this initialization. Do not invent them.

## Product Principles

1. Prioritize the everyday personal-image workflow over specialist research tooling.
2. Make the journey from selecting an image to inspecting and downloading the result understandable without watermarking expertise.
3. Explain the difference between observed evidence, processing performed, and independently verified outcomes.
4. Describe privacy and output-quality tradeoffs accurately against the implemented behavior.
