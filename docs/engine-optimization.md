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

## Automated checks

Run `pnpm lint`, `pnpm test`, `pnpm build`. The build also verifies prerendered
localization and route bundle boundaries. Targeted tests cover real OpenCV 5
loading/template matching/restoration, negative detection reuse, resource
cleanup, optional-failure recovery, bounded metadata decompression, JPEG APP11
continuations, WebP flags, BMFF offsets, local C2PA settings and interpretation,
queue cancellation/retry/isolation and exact ZIP output bytes.

Final full-suite run: `pnpm exec vitest run --maxWorkers=2 --testTimeout=20000`
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

## UI review

Impeccable context, craft guidance and one detector pass were used. The detector
reported no findings. An independent agent reviewed desktop/mobile captures and
requested mobile control ordering and documentation corrections. Both were
implemented and verified against new production-build captures; final verdict:
**ship**, no remaining material findings. The harness did not expose the named
Impeccable reviewer/documenter roles, so an independent equivalent performed
those checks. DESIGN.md and the surface brief record the final extension; no
new raster assets were shipped. Review captures remain local and gitignored.
