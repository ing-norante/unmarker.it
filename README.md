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

## Sponsors

Manage the four house projects in `src/lib/sponsors.ts`. Each entry has a unique `id`,
`name`, `claim`, destination `url`, and `icon` (a local image path or emoji).
House projects use `kind: "house"`; paid campaigns arrive automatically from the
PostgreSQL-backed catalog with `kind: "paid"`.
Place new icons in `public/sponsors/` and reference them as `/sponsors/name.ico`;
the production Content Security Policy allows local images, not remote favicons.

- Up to 20 sponsors: the first 10 fill balanced left/right cards, then sponsors
  11–20 fill the backs alternately. Extra entries are ignored.
- Desktop sidebars appear from 1440px; narrower screens use scrolling bars
  (first 10 at the top, next 10 at the bottom).
- Paired cards use a 20-second cycle, with equal 10-second front/back phases.
  Negative animation offsets stagger the cards without adding an initial delay.
  Animations can be paused, stop while interacting, and respect reduced motion.
- The advertisement dialog shows availability and €500 per slot for 30 days,
  starting at confirmed purchase. It requests a name, icon, URL and short description.
  TanStack Form and shadcn validate the creative and open hosted Stripe Checkout.
  This is one payment, without automatic renewal. Booking requires the sponsor
  API and available capacity.
- Sponsor URLs automatically receive referral UTM parameters for `unmarker.it`.
  Verified payments publish campaigns automatically; they disappear after 30 days.

For local QA, check desktop/mobile layouts, light/dark themes, both locales,
upload/reset, the advertisement dialog, and keyboard navigation. Temporarily
use 12 or 20 uniquely identified sponsors to check both flip columns and the
bottom mobile bar; enable reduced motion to check the static alternative.

### Sponsor analytics

[PostHog dashboard](https://eu.posthog.com/project/104940/dashboard/955480)
contains visible impressions, clicks, CTR, workflow completion by rollout/device,
and a historical baseline with a fixed cutoff before deployment.

- `sponsor_impression`: at least 50% of a placement visible for one continuous
  second in a foreground tab. Hidden faces, clipping and a modal covering the
  visible center disqualify exposure. Sampling is conservative, not a guarantee
  that a person looked at the card. One impression per sponsor/position/face/pageview;
  repeated rotations, StrictMode remounts and marquee copies are deduplicated.
- `sponsor_clicked`: every link activation (also keyboard and middle click),
  with sponsor, location, one-based position, face and optional impression ID.
  Fast clicks remain counted without fabricating a qualifying impression.
- `sponsor_advertise_opened` and `sponsor_checkout_clicked`: interest in booking.
  Checkout clicks do not imply payment. The server separately emits
  `sponsor_purchase_confirmed` and `sponsor_campaign_activated` through a durable
  outbox, excluding Stripe test payments.
- CTR is total clicks / visible impressions for the same sponsor and placement.
  No impressions means no meaningful CTR. Repeated/fast clicks can exceed 100%.
  Filter clicks by `first_click_for_impression = true` for a separate metric of
  clicked qualifying impressions / qualifying impressions.
- Existing workflow events retain their IDs and receive `sponsor_layout_version`,
  `sponsor_count` and `sponsor_seen_before_event`. Compare `sponsors_v1` with
  `legacy_unlabelled` by device. Completion means the same visitor/workflow
  completes within 30 minutes, including analysis-only results; starts less than
  30 minutes old are excluded. Missing rollout labels indicate historical code,
  not a randomized control group. These reports do not prove causality.
- Sponsor trends exclude project-defined test accounts and filter the production
  host. Workflow SQL filters `www.unmarker.it` but does not apply project test-account
  exclusions. SQL windows are explicit and do not follow dashboard date controls.
  Localhost capture remains disabled; tests mock PostHog and send no events.

The implementation and automated tests are ready for manual QA. Verify clipping,
background/foreground changes, flipping, duplicate marquee copies and modal
occlusion locally, then check real ingestion after an approved deployment.
The [Stripe sponsorship implementation guide](docs/stripe-sponsorship-plan.md)
contains local PostgreSQL/Stripe setup, test commands, server architecture and
the production database, webhook and scheduler connection steps. The completed
Stripe test checkout has been verified locally; live sales are disabled.

## Environment Variables

Optional analytics configuration:

```bash
VITE_PUBLIC_POSTHOG_KEY=...
VITE_PUBLIC_POSTHOG_HOST=...
```

`VITE_PUBLIC_POSTHOG_HOST` is kept as the default capture endpoint variable.
`VITE_PUBLIC_POSTHOG_API_HOST` and `VITE_PUBLIC_POSTHOG_UI_HOST` are also
supported when the capture and app hosts need to be configured separately.
Set these variables in the Vercel project environment before building; Vite
embeds `VITE_*` values into the production bundle at build time.

Without these, image processing still works locally.

## Deployment Notes

The production CSP in `vercel.json` intentionally allows `'unsafe-eval'`, `'wasm-unsafe-eval'`, and `connect-src data:` because the OpenCV.js worker used by Gemini Scan creates functions dynamically and fetches its generated WebAssembly payload from a data URL. Removing these will cause Gemini Scan to fail in production with browser CSP errors.

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
