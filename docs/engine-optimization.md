# Image engine and batch implementation

Implemented on `engine-optimization`, September 2026. All image operations remain
local to the browser. The external reference repository informed the structure
of per-file results and defensive metadata parsing; its Python/backend pipeline
is not embedded or called.

## Boundaries

- `lib/engine` owns one full image attempt and its pixel resources. Errors are
  typed, warnings are message descriptors, cancellation is an AbortSignal.
- `lib/c2pa` owns SDK/worker initialization, offline verification policy and
  typed active-manifest interpretation. Signature integrity and signer trust
  remain separate; no trust claim is manufactured from successful local reads.
- `lib/batch` owns admission, sequence, attempt identity, output retention and
  export. React only subscribes and presents the chosen item.
- `engineTelemetry` is an optional consent-gated adapter. It preserves lifecycle
  events without adding analytics to the engine or disclosing file contents.
- Superseded single-file hooks and components have been removed instead of
  maintaining two processing paths.

## Refactoring follow-up

The follow-up implementation covers the image/workflow and general build findings
in [the September 19 audit](refactoring-review-2026-09-19.md). Sponsor components,
services, purchase contracts, tests, legal documents and sponsor-specific scripts
are excluded. Shared build tooling preserves the same published routes and lazy
bundle boundaries.

- Engine outcomes and queue entries use discriminated unions. Processed results
  always carry an output and a postflight audit; analysis-only results carry
  neither. Visible detection must explicitly state whether it actually ran.
- `lib/workflow/operations` acquires a queue lease for metadata cleanup and ZIP
  export. Admission, retry, removal and resume cannot overlap those operations,
  even through a direct queue call. Preview selection remains independent. A
  cancellation retains the lease until the underlying operation settles.
- `lib/workflow/presentation` derives phases, badges, verification completeness
  and action availability. Notices retain message descriptors, so switching
  language updates existing notices without rerunning image work.
- `lib/runtime` shares abort, deadlines and promise settlement. Each worker
  driver still owns its protocol and lifespan; malformed terminal messages reject
  instead of leaving a promise unresolved. `lib/pixelPipeline` shares the pixel
  stages between the worker and fallback, using neutral canvas primitives.
- Metadata parsers produce an operation-local inspection and edit plan. Scan and
  clean use the same classification; the cleaner applies its plan only after all
  warnings are known. Plans and image buffers are not retained in queue results.
  Incomplete scans caused by malformed data, decompression or exhausted budgets
  preserve the original file. Existing display/coverage warnings still permit
  the known safe edits.
- A metadata segment retains all matching markers. Its display marker remains
  available alongside the complete evidence; the ZIP report retains its version-1
  fields. Fallback scans keep credential UUIDs separate from independent textual
  AI/provider evidence. Content Credentials presence alone remains insufficient
  to classify AI origin.
- Per-operation parsing defaults to 16 MiB of searchable metadata and 100,000
  structural entries. PNG retains its tighter 1 MiB text-chunk and 4 MiB aggregate
  text limits. Abort is checked after file reads and at cooperative parsing
  boundaries; a browser `Blob.arrayBuffer()` already in progress cannot itself
  be cancelled. The textual scanner bounds temporary strings to 16 KiB input
  blocks rather than concatenating four full decoded representations.
- `WorkspaceFrame` shares the established home/loading/batch shell. General
  theme and workspace styles are separated without changing sponsor styling.
  Unused UI primitives, scaffolding assets, old mode validation and its decoder
  have been removed. `sonner` is no longer an installed dependency.
- `scripts/build-artifacts.ts` shares canonical output paths and traversal of
  static imports. Dynamic engine/billing imports stay deferred. ESLint now uses
  browser, worker and Node scopes, includes MJS scripts, and Node type checking
  includes all TypeScript scripts. Node 22.12+ is declared in `package.json`.

### Scanner measurement

The development-only comparison is reproducible with:

```bash
node --expose-gc --import tsx scripts/benchmark-metadata.ts legacy
node --expose-gc --import tsx scripts/benchmark-metadata.ts streaming
```

Run each mode in a fresh process. A local Node 24 ARM64 run used a deterministic
16 MiB binary payload, three separate processes per variant, and reported:

| Metric | Previous scanner | Block scanner |
| --- | ---: | ---: |
| Median elapsed time | 1,874 ms | 1,244 ms |
| Process peak RSS | approximately 1,025 MiB | approximately 113 MiB |
| Heap used after scan | approximately 754 MiB | approximately 8–16 MiB |

These measure the synchronous text-search routine for one synthetic workload,
not browser scheduling, device performance or a guarantee for every image.
The production parser uses the same scanner with cooperative task yields.
Boundary/encoding fixtures and
deterministic binary comparisons check match compatibility separately. Arbitrarily
long `sd:` tokens are bounded to a 256-character evidence prefix.

### Follow-up verification

Final follow-up command: `pnpm exec vitest run --maxWorkers=2 --testTimeout=20000`:
**375 passed, 44 skipped, 1 failed** (420 tests). The only failure is the existing
missing Italian sponsor-terms source described below. Sponsor tests/documents
were excluded from changes; the failure was not hidden with a skip or a changed
expectation. `pnpm lint`, TypeScript and the full production build passed,
including prerendered localization and initial/deferred chunk checks.

Production Chromium checks used the exact CSP from `vercel.json` and local test
images, with the separate sponsor API stubbed locally:

- Three images produced three unique JPEG entries and a version-1 ZIP report.
  The mixed OpenAI/provenance PNG retained both AI evidence and the local C2PA
  reference result; the valid credential JPEG reported valid local integrity
  with unknown signer trust. Observed requests stayed on the local origin or
  blob URLs; image files were not uploaded.
- The metadata-clean PNG had byte-identical decoded pixels to its original.
- EN→Simplified Chinese→EN updated existing download notices in place while
  retaining the queue and outputs.
- With a controlled delay on local Blob reads, cleanup disabled admission,
  resume, retry, export and reset. Selection remained available, the global
  cancel action remained reachable, and cancellation held the lease until the
  read settled. It preserved the user's pause and produced no late download.
- Pause, cancel of waiting work, retry from the original and resume completed;
  reset returned focus to the image chooser. There were no browser page errors.
- Layouts were checked at 320, 390, 1024 and 1440 CSS pixels without horizontal
  document overflow. Desktop and mobile captures preserved the incumbent layout.
  The final capture confirmed an unverified hidden-watermark badge, with no
  misleading pending badge after completion.

Independent core and visual review identified two issues during integration:
fallback scans initially merged independent AI evidence into the C2PA signal,
and a legacy UI badge still said pending. Both were corrected in separate
commits with regression tests and included in the final checks above. Sponsor
source paths and retained sponsor CSS blocks were compared against `4b2440a`
and remained unchanged. Local review captures are gitignored.
The independent final verdict was **ship**, with no remaining material findings;
DESIGN.md reconciliation passed. No additional visual polishing followed.

## Automated checks

Run `pnpm lint`, `pnpm test`, `pnpm build`. The build also verifies prerendered
localization and route bundle boundaries. Targeted tests cover real OpenCV 5
loading/template matching/restoration, negative detection reuse, resource
cleanup, optional-failure recovery, bounded metadata decompression, JPEG APP11
continuations, WebP flags, BMFF offsets, local C2PA settings and interpretation,
queue cancellation/retry/isolation and exact ZIP output bytes.

Initial engine delivery full-suite run: `pnpm exec vitest run --maxWorkers=2 --testTimeout=20000`
reported **274 passed, 44 skipped, 1 failed**. Lower concurrency and a 20-second
per-test timeout were used after loaded-host runs exceeded the default 5 seconds
in startup and the multi-megabyte PNG fixture. `pnpm lint` and the complete
production build passed.

The existing `scripts/legal-pages.test.ts` expects
`docs/legal/sponsor-terms.it.md`, which is absent in baseline commit `b409e1e`.
That unrelated assertion fails in the complete suite; no legal text or test
expectation was changed to conceal the missing document. Database-dependent
sponsor tests retain their existing environment-dependent skips.

## Browser checks performed

Chromium on the local development build, plus a production-build run served
with the exact Content Security Policy from `vercel.json`:

- Multiple image selection, ordered processing, selection without reprocessing,
  individual JPEG and ZIP download; ZIP entries and report inspected locally.
- Pause/resume, cancellation of unfinished work with completed results retained,
  unsupported inputs and malformed images.
- StrictMode mount, rerender with a new equivalent initial array, and unmount:
  exactly one admission and cleanup on disposal.
- Pixel processing fallback with new Worker construction unavailable.
- Desktop and 390px mobile layouts, English and Simplified Chinese, no horizontal
  document overflow in checked states.
- Official `contentauth/c2pa-rs` fixtures `C.jpg`, `E-sig-CA.jpg` and
  `libpng-test_with_url.png`: respectively valid, invalid and incomplete local
  credential results. Full engine processing still returns output with warnings
  where needed. Captured requests showed no remote manifests or OCSP requests;
  application asset and separate sponsor-consent requests are expected.
- Metadata-only cleanup of the official valid JPEG: decoded pixel bytes unchanged.

The synthetic flat/gradient fixtures can trigger a Gemini match after noise and
JPEG encoding; postflight reports this as residual visible-mark evidence. The
inherited detector is heuristic and can produce false positives. Detection
thresholds were not retuned against a small development sample.

These checks are not a cross-device performance benchmark. Safari, Firefox,
mobile low-memory termination and large sustained batches still merit manual
QA before release. OpenCV 5 increases the generated worker to roughly 15.6 MB;
C2PA adds a separate roughly 8.4 MB WASM asset, loaded only for candidate files.
Both are application assets and can be cached by the browser.

## Suggested manual acceptance run

1. Mix PNG, JPEG, WebP, an undecodable metadata-supported file, a text file and
   duplicate filenames. Check that each accepted entry has an independent result.
2. Pause during a large image, cancel another waiting item, retry the cancelled
   image and resume. Previously completed outputs must remain downloadable.
3. Change quality, retry one image and check that other queued settings did not
   change. Retry reads the original, never an earlier JPEG output.
4. Compare input/output previews; inspect warnings, orientation and color.
5. Export the ZIP, check unique names and `report.json`, then remove completed
   entries to release their retained data.
6. Repeat in the target browser with network recording enabled. Image processing
   and local credential verification must not send image files or follow remote
   credential URLs. Verify a second run after a cancelled worker operation.

## Initial delivery UI review

Impeccable context, craft guidance and one detector pass were used. The detector
reported no findings. An independent agent reviewed desktop/mobile captures and
requested mobile control ordering and documentation corrections. Both were
implemented and verified against new production-build captures; final verdict:
**ship**, no remaining material findings. The harness did not expose the named
Impeccable reviewer/documenter roles, so an independent equivalent performed
those checks. DESIGN.md and the surface brief record the final extension; no
new raster assets were shipped. Review captures remain local and gitignored.
