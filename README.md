# Unmarker.it

Client-side image analysis and post-processing tool built to detect local AI provenance signals, disrupt watermark traces in-browser, and verify the generated JPEG output.

## Image workflow

Select one or more local images. Every file uses the same autonomous engine:
preflight analysis → pixel processing → postflight checks → structured result.
A queue runs one complete image job at a time. Errors, warnings and analysis-only
results stay attached to their file; other entries can continue.

- Pause finishes the active image before stopping. Cancel interrupts an active
  image or cancels waiting entries. Retry always reads the original file.
- Select any queue entry to inspect it without changing the active job.
- JPEG quality changes apply to newly added images and explicit retries.
- Download individual JPEGs or a ZIP of completed outputs plus `report.json`.
  The archive uses unique, sanitized names, stores already-compressed JPEGs
  without recompressing them, and is assembled in a dedicated worker.
- ZIP export pauses the queue and is available when no image is active. It can
  be cancelled. Download actions start a browser download; they do not confirm
  that the user saved the file.
- No queue is persisted across page reloads. Remove entries or start over to
  release their retained originals and outputs.

### Limits and memory

Inputs are limited to **25 MiB per file** and pixel processing to **40 megapixels**.
A batch retains at most **20 files**, **200 MiB of inputs**, and **128 MiB of
compressed outputs**. These are retention limits, not a bound on total browser
RAM: decoded pixels, WASM runtimes, previews and the ZIP need additional memory.
At the output limit the queue pauses and retains completed results. Download and
remove entries, retry the failed image, then resume. Smaller batches are suitable
for memory-constrained devices.

The Gemini worker reads a bottom-right region of at most 288 × 374 pixels rather
than receiving an entire image. It reuses OpenCV and watermark templates; a
negative preflight detection is reused during processing. Timeouts, worker errors
and cancellations reset the affected runtime. Images are decoded once for the
processing pass; postflight separately decodes the actual JPEG. Canvas,
ImageBitmap and OpenCV allocations are released after use. Only the selected
entry owns preview URLs.

Shake, Stir and JPEG encoding run in an OffscreenCanvas worker when supported.
The fallback yields between noise strips to keep cancellation responsive. This
reduces main-thread work; it does not eliminate the temporary memory needed for
large image decoding. No WASM threads or cross-origin isolation are required.

### Processing and evidence

1. **Gemini Scan** checks for the visible Gemini / Nano Banana sparkle with
   OpenCV.js **5.0.0-release.1** template matching.
2. **Gemini Restore** reverses the detected alpha blend and repairs residual
   edges with inpainting. Optional scan/repair failures surface as warnings.
3. **Shake** applies a small random geometric transform.
4. **Stir** adds Gaussian noise.
5. **Crush** exports a lossy JPEG (default quality `0.85`).

Postflight scans that generated JPEG. Local origin evidence is categorical,
without an invented AI probability. A visible template-match score describes
that match only. Hidden-watermark removal remains **unverified**, even after a
successful run; this is not a universal detector or guaranteed remover.

### Local C2PA and metadata

Content Credentials alone do **not** imply AI generation. The lazy-loaded
`@contentauth/c2pa-web` **0.15.1** SDK reads the active manifest locally with a
self-hosted WASM asset. The UI separates declared origin, local integrity and
signer trust. Explicit trained-algorithm source declarations are AI evidence;
photographic and ordinary composite declarations are not automatically AI.
Declarations are not proof of how the pixels were created.

Remote manifest retrieval, OCSP, timestamp trust and trust-list verification
are disabled. No remote credential URL is followed. Signer trust is reported as
unknown, even if local integrity checks pass. Unsupported, unavailable or timed
out reads are incomplete rather than negative (30-second local-read timeout).
The SDK starts only when container inspection finds credential candidates.

Original-format metadata cleanup remains a secondary download action:

- PNG compressed text is bounded to 1 MiB per chunk and 4 MiB per file. Partial
  inspection is reported explicitly.
- JPEG C2PA APP11 continuations are removed together. EXIF and display-relevant
  XMP are preserved where removing them could change orientation.
- WebP chunk sizes, RIFF length and VP8X metadata flags stay consistent. EXIF
  needed for display is preserved.
- AVIF/HEIF/JXL box cleanup replaces eligible boxes with same-size zeroed `free`
  boxes, preserving offsets. Metadata stored through image items is not fully
  covered; `meta`/`moov` coverage is reported as partial.
- Malformed structures are not rewritten optimistically. Cleanup may leave
  markers in preserved display metadata and does not promise complete removal.

## Privacy

Image files, decoded pixels, credential contents and ZIP reports stay in the
browser. The image engine needs no upload endpoint, account or processing server.
Application scripts, OpenCV and C2PA WASM are downloaded as application assets.
The existing sponsorship service and consent-gated PostHog usage instrumentation
are separate from image processing; local processing does not mean the whole
website makes no network requests. Filenames and raw metadata are not workflow
analytics properties.

## Validation

```bash
pnpm lint
pnpm test
pnpm build
```

Tests cover parser boundaries, credential interpretation and offline settings,
worker recovery, real OpenCV 5 detection/restoration on a synthetic fixture,
engine cancellation, queue sequencing and ZIP byte integrity. See
[implementation and manual checks](docs/engine-optimization.md) for browser QA.

## Quick Start

### Prerequisites

- Node.js 22.12+ (required by the current Vite toolchain)
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

Manage the three house projects in `src/lib/sponsors.ts`. Each entry has a unique `id`,
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
- The `/sponsorship` page shows availability and €500 per slot for 30 days,
  starting at confirmed purchase. It requests a name, icon, URL and short description.
  TanStack Form and shadcn validate the creative and open hosted Stripe Checkout.
  This is one payment, without automatic renewal. Booking requires the sponsor
  API and available capacity.
- Sponsor URLs automatically receive referral UTM parameters for `unmarker.it`.
  Verified payments publish campaigns automatically; they disappear after 30 days.

For local QA, check desktop/mobile layouts in dark mode, both locales,
upload/reset, the sponsorship page, and keyboard navigation. Temporarily
use 12 or 20 uniquely identified sponsors to check both flip columns and the
bottom mobile bar; enable reduced motion to check the static alternative.

### Conferma manuale degli acquisti sponsor

**Quando:** dopo ogni acquisto sponsor con pagamento riuscito, appena il webhook
o la riconciliazione lo hanno registrato nel database. Inviare la conferma senza
ritardo, senza aspettare la scadenza della campagna o l'emissione della fattura.
Non inviarla per checkout aperti, abbandonati o pagamenti ancora in attesa/falliti.
La ricevuta Stripe e la pubblicazione automatica dello sponsor non eseguono questa
procedura: la conferma completa viene preparata dal comando e inviata manualmente
dall'amministratore.

1. **Selezionare l'ambiente corretto.** Dalla directory del progetto, verificare
   che `.env` punti al database dell'acquisto: locale, Preview o produzione.
   Per un ordine live serve il database di produzione, non quello dei test locali.
   Per la configurazione consultare la
   [guida Stripe](docs/stripe-sponsorship-plan.md) e la
   [guida Preview](docs/sponsor-preview.md); mantenere private le credenziali.
2. **Recuperare il riferimento dell'ordine in Stripe.** Aprire la Checkout Session
   del pagamento riuscito e leggere `client_reference_id` oppure il metadato
   `unmarker_purchase_id`. Questo UUID identifica l'acquisto nel database;
   non usare l'identificativo Stripe `cs_…` o `pi_…`.
3. **Generare la bozza e l'allegato**, sostituendo entrambe le occorrenze di
   `UUID_ACQUISTO` con il riferimento recuperato:

   ```sh
   pnpm sponsors:confirmation UUID_ACQUISTO .sponsor-data/conferma-UUID_ACQUISTO it
   ```

   Usare `en` al posto di `it` per una mail in inglese. Il comando crea
   `email.txt` e `condizioni-accettate.txt` in una cartella privata esclusa da Git.
   Non invia email, non modifica l'ordine e non emette fatture.
4. **Controllare `email.txt`.** Verificare ambiente TEST/LIVE, stato del pagamento,
   destinatario, sponsor, imponibile, IVA, totale e date di inizio/fine in UTC.
   Gli importi rappresentano il pagamento originario: se nel frattempo sono
   intervenuti rimborsi, cessazione o contestazioni, adeguare il testo prima
   dell'invio.
5. **Inviare da Aruba.** Comporre una mail da **help@nomadesrl.it** al destinatario
   indicato nel file. Copiare solo oggetto e corpo, escludendo le righe di controllo
   ambiente/stato. Allegare **`condizioni-accettate.txt`**: contiene la versione
   originale accettata dal cliente, verificata tramite hash. Non sostituire
   l'allegato con il solo link ai termini correnti sul sito.
6. **Registrare l'invio.** Conservare mail e allegato nel fascicolo dell'ordine,
   annotando data e riferimento del messaggio per evitare duplicati. Eliminare
   le copie locali di lavoro non necessarie. La fatturazione resta separata e
   segue il processo amministrativo in Fatture in Cloud.

Se il comando non trova il pagamento confermato, verificare prima l'ambiente e
la ricezione del webhook; se necessario eseguire `pnpm sponsors:reconcile`
nell'ambiente corretto e riprovare. Non aggirare eventuali errori di integrità
delle evidenze. Il comando rifiuta una cartella di destinazione già esistente:
usare la bozza già verificata oppure una nuova cartella per rigenerarla.
La generazione dei file **non registra né sostituisce l'invio della mail**.

La [guida amministrativa](docs/legal/manual-sponsor-administration.md) include
anche la procedura per interrompere una campagna su richiesta del cliente.

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
- `sponsorship_link_clicked`: every sponsorship link activation, including keyboard,
  modified clicks and middle clicks. `link_location` distinguishes `desktop_left_card`,
  `desktop_right_card`, `desktop_controls`, `mobile_controls`, and `language_switcher`;
  `source_path`, `destination_path`, `destination_locale`, and `activation` describe
  the navigation without recording query strings or form data.
- `sponsorship_page_viewed`: arrival on the sponsorship page after analytics can
  initialize with consent, including direct visits. Deduplicated for the current
  page/language; language navigation creates another view. Clicking the already
  selected language does not create another view.
  Use **unique users** for visitor counts, **total events** for click counts, and
  an ordered `sponsorship_link_clicked` → `sponsorship_page_viewed` funnel to measure
  arrivals after a click. Exclude `link_location = language_switcher` when measuring
  acquisition into the sponsorship flow. Direct visits can have no preceding click.
  These metrics cover consenting visitors only; rejected/pre-consent clicks are
  never replayed, and browser/network blocking can prevent delivery.
- `sponsor_advertise_opened` remains a compatibility event for Advertise clicks
  (`legacy_compatibility_event: true`); do not sum it with `sponsorship_link_clicked`.
  `sponsor_checkout_clicked` records the transition to Stripe.
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
The [online sandbox preview guide](docs/sponsor-preview.md) describes the isolated
Neon branch, Vercel Preview settings and online QA procedure.

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
  App.tsx                      # Lightweight shell; lazy workflow loading
  WorkflowApp.tsx              # Batch controls and selected result composition
  hooks/useBatchQueue.ts        # React subscription and queue lifecycle
  hooks/useBlobUrl.ts           # Selected preview URL ownership
  lib/engine/                  # Autonomous processImage and resource lifecycle
  lib/engineTelemetry.ts        # Consent-gated adapter outside the engine
  lib/batch/queue.ts            # Sequential jobs, attempts, limits and names
  lib/batch/archive.ts          # ZIP stream and local report
  lib/batch/export.ts           # Export worker lifecycle
  lib/c2pa/                    # Local SDK lifecycle and typed manifest reading
  lib/metadata/                # Format parsers and conservative cleanup
  lib/metadataCleaner.ts       # Metadata scan / clean entry points
  lib/aiProvenanceScore.ts      # Categorical local evidence (no probability)
  lib/imageAudit.ts            # Before/after audit composition
  lib/pipeline.ts              # Shake / Stir / Crush algorithms
  workers/                    # Gemini OpenCV, pixel processing and ZIP workers
  components/BatchQueuePanel.tsx # Accessible queue controls
  components/BatchResult.tsx   # Selected image actions and evidence
```

The engine returns `{ output, outputName, preflight, postflight, outcome,
warnings, canCleanMetadata }` and accepts `{ signal, onProgress }`. It has no
React, toast, analytics or download dependencies. The queue consumes this same
contract for every file, including a batch of one. The design keeps future
processors and format-specific export paths independent of React.

## Limitations

- This is a heuristic perturbation pipeline, not a guaranteed watermark remover
  or a general-purpose AI-image detector.
- Pixel processing depends on browser decoder support. Supported metadata formats
  can remain analysis-only; very large images are not processed.
- Main outputs are lossy JPEGs. Transparency, original encoding and original
  metadata are not preserved in the processed output.
- Memory limits cannot prevent every browser/device out-of-memory termination.
- The current queue is intentionally sequential. It does not claim a throughput
  improvement from parallel image processing.

## References

Sources that informed the design of this tool:

- [watermarks-remover](https://github.com/guillaumemeyer/watermarks-remover) — reporting and parser hardening patterns; [analysis](docs/watermarks-remover-analysis-2026-09-18.md)
- [Content Authenticity browser SDK](https://github.com/contentauth/c2pa-js) — local C2PA reader
- [UnMarker: A Universal Attack on Defensive Image Watermarking](https://arxiv.org/abs/2405.08363) — research background
- [Watermarks offer no defense against deepfakes](https://uwaterloo.ca/news/media/watermarks-offer-no-defense-against-deepfakes) — University of Waterloo coverage

## License

[MIT](LICENSE)
