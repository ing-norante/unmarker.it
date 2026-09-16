# Unmarker.it — Post-polish technical audit

Date: 2026-09-16. Target: the homepage and image workflow previously identified as http://localhost:5173/.

## Implementation integrity verdict

**Pass for a coherent, product-specific design system; three technical issues remain.** The Image Workbench retains its square controls, documented English and Chinese typography, Muted Petrol Blue, explicit processing steps, and local-image workflow. No redesign is indicated.

The detector returned seven entries: one generic Geist warning and six type-size advisories. Geist Mono is the established design choice. The sizes belong to the existing responsive display treatment, Chinese fluid typography, and compact button variant. They are not counted as user-facing defects. No artifact drift was repaired.

## Executive summary

**Audit health: 15/20 — Good.** These are source-review prioritization scores, not accessibility certification or measured browser performance.

**3 verified issues: 0 P0, 1 P1, 2 P2, 0 P3.**

| Dimension | Score | Key finding |
| --- | --- | --- |
| Accessibility | 3/4 | Progress, slider names, and announcements improved; shared focus contrast still needs correction |
| Performance | 3/4 | Deferred workflow, worker processing, and cooperative yielding; large worker payload still needs device/network measurement |
| Responsive design | 3/4 | Container-based layouts, wrapping, and touch targets are implemented; current reflow needs human browser verification |
| Theming | 3/4 | Semantic text colors are separated from fills; light-theme focus and thumb strokes remain too faint |
| Implementation integrity | 3/4 | Unverified hidden-watermark states are honest; skipped visible scans still feed the no-evidence score |
| **Total** | **15/20** | **Good — address the remaining gaps** |

The earlier audit scored 12/20 under broader browser coverage. The scores are not directly equivalent measurements: this pass reviews the revised source without launching browser QA.

## Scope and validation

- Read the current homepage, processing workflow, shared controls, styles, locale handling, image-audit logic, and error states.
- Ran the bundled detector once and reviewed its findings against the established design.
- All **102 tests across 13 files passed** during this audit.
- `git diff --check` passed. The immediately preceding polish pass also passed lint and the production build; application source has not changed since those checks.
- Reviewed that build's artifacts: entry JavaScript 263.85 kB / 82.63 kB gzip; lazy workflow chunk 162.70 kB / 44.99 kB gzip; worker 10,797.22 kB uncompressed. These are individual assets, not total transferred bytes. The worker is deferred; its size alone is not treated as a defect without profiling alternatives and transfer behavior.
- No local server or browser QA session was launched. No new viewport screenshots, screen-reader speech checks, frame-rate measurements, or Core Web Vitals were collected. Existing browser observations predate the latest changes.

## Detailed findings

### 1. [P1] Shared light-theme focus indicators lack sufficient contrast

**Category:** Accessibility / Theming.

**Locations:** [focus token](/Users/eppedema/Documents/workspace/unmarker.it/src/index.css:92), [button focus styling](/Users/eppedema/Documents/workspace/unmarker.it/src/components/ui/button.tsx:9), [slider thumb](/Users/eppedema/Documents/workspace/unmarker.it/src/components/ui/slider.tsx:58).

Buttons suppress the native outline and use the ring token for their focused border and a 50%-opacity ring. Calculations from the source OKLCH values give:

| Light-theme pair | Contrast |
| --- | --- |
| Opaque ring token against white | 2.324:1 |
| 50% ring composited over white | 1.475:1 |
| Slider thumb border against the muted track | 2.107:1 |

The first two are the available focus cues on ordinary outline buttons on a white surface. The white slider thumb also relies on this faint stroke for its boundary. The upload control has its own stronger primary-text outline and is not included in this finding.

**Impact:** Low-vision keyboard users can have difficulty locating the active action or slider handle.

**Standard:** WCAG 1.4.11 Non-text Contrast, 3:1 for required control/state information against adjacent colors. These calculations concern authored indicators, not a claim that every focus state or theme fails.

**Recommendation:** Use a dedicated contrast-safe focus token or opaque outline, verify both themes and each button surface, and strengthen the slider boundary. Preserve the existing text/fill distinction.

**Suggested command:** `$impeccable harden`.

### 2. [P2] Unavailable browser storage blocks language switching and dismissal

**Category:** Implementation integrity / resilience.

**Locations:** [preference writes](/Users/eppedema/Documents/workspace/unmarker.it/src/i18n/LocaleProvider.tsx:89), [locale selection](/Users/eppedema/Documents/workspace/unmarker.it/src/i18n/LocaleProvider.tsx:98), [suggestion dismissal](/Users/eppedema/Documents/workspace/unmarker.it/src/i18n/LocaleProvider.tsx:125), [link interception](/Users/eppedema/Documents/workspace/unmarker.it/src/components/LanguageSwitcher.tsx:27).

`recordPreference()` writes to localStorage before updating memory or applying the selected language. If storage access or writes throw, `selectLocale()` exits before changing language. The link's default navigation was already prevented, so the ordinary click has no fallback. Dismissal likewise writes before hiding the suggestion. Initial storage reads also lack a guard.

**Impact:** With blocked storage or exhausted storage quota, language controls can stop responding and the suggestion can remain visible. Direct navigation to a locale URL remains a workaround.

**Standard:** Robustness issue; no specific WCAG failure assigned from source alone.

**Recommendation:** Make persistence best-effort, preserve in-memory preferences, and let locale changes and dismissal complete even when reads or writes fail. Verify throwing getItem/setItem paths.

**Suggested command:** `$impeccable harden`.

### 3. [P2] Skipped or failed visible scans receive the same no-evidence summary as completed scans

**Category:** Implementation integrity / state accuracy.

**Locations:** [audit builder](/Users/eppedema/Documents/workspace/unmarker.it/src/lib/imageAudit.ts:38), [score fallback](/Users/eppedema/Documents/workspace/unmarker.it/src/lib/aiProvenanceScore.ts:85), [summary copy](/Users/eppedema/Documents/workspace/unmarker.it/src/i18n/resources/en/workflow.ts:85), [score display](/Users/eppedema/Documents/workspace/unmarker.it/src/components/AnalysisPanel.tsx:44).

The audit tracks `not-scanned` and `failed` visible-scan states, but passes only metadata and detection results to the scoring function. With empty metadata and null detection, that function returns the same 12% / `none` result regardless of whether pixels were checked. The description then says metadata and visible watermark checks found no AI signal. An analysis-only image or failed detector can reach this path.

**Impact:** The prominent evidence panel implies a completed negative check while the adjacent visible-scan panel correctly says the check did not finish. Users must resolve contradictory summaries themselves.

**Standard:** Product-state accuracy; no specific WCAG failure assigned.

**Recommendation:** Carry scan availability into the evidence model. Distinguish incomplete analysis from a completed scan with no findings, use an unavailable or partial presentation where appropriate, and localize both languages consistently.

**Suggested command:** `$impeccable harden`; use `$impeccable clarify` for the resulting partial-analysis wording.

## Patterns and positive findings

The remaining gaps cluster at shared control styling and boundaries between optional services or incomplete data and user-visible state.

Maintain these improvements:

- Named progress values and a static provenance meter; localized slider thumb name, description, and percentage.
- A single native upload action with disabled-state handling and same-file selection reset.
- Polite completion announcements, neutral hidden-watermark icons, and incomplete output-check badges.
- Distinct unreadable-metadata and image-preview failure messages.
- Container-responsive result layouts, wrapping controls, coarse-pointer touch targets, and user-relative root type sizing.
- Immediate rendering independent of analytics; no artificial 500ms processing delays; worker-based detection and chunked noise processing.
- Reduced-motion behavior retains textual status and a static processed-image frame. Although a global near-zero-duration fallback exists, no loss of necessary state feedback was established in the current source, so it is not counted as a defect.

## Human verification still needed

Check both languages/themes at narrow widths and enlarged text; keyboard focus after choosing an image and after Start over; the full quality-slider keyboard interaction; live status announcements; preview failures; slow worker loading and cancellation; and reduced-motion states. In particular, shell replacement has no explicit focus restoration, so its browser behavior should be checked before claiming complete keyboard coverage.

## Recommended actions

1. **[P1/P2] `$impeccable harden`** — fix focus contrast, storage resilience, and scan-availability propagation.
2. **[P2] `$impeccable clarify`** — align partial-analysis wording with the corrected state model in both locales.
3. **`$impeccable polish`** — final consistency pass after those fixes.

You can ask me to run these one at a time, all at once, or in any order you prefer. Re-run `$impeccable audit` after fixes to see your score improve.

This audit changed only this report; no application fixes were applied.
