---
name: "Unmarker.it"
description: "The Image Workbench: bold, utilitarian, and assertive."
colors:
  primary: "oklch(0.52 0.105 223.128)"
  dark-primary: "oklch(0.45 0.085 224.283)"
  primary-foreground: "oklch(0.984 0.019 200.873)"
  dark-primary-foreground: "oklch(0.984 0.019 200.873)"
  background: "oklch(1 0 0)"
  dark-background: "oklch(0.153 0.006 107.1)"
  foreground: "oklch(0.153 0.006 107.1)"
  dark-foreground: "oklch(0.988 0.003 106.5)"
  card: "oklch(1 0 0)"
  dark-card: "oklch(0.228 0.013 107.4)"
  card-foreground: "oklch(0.153 0.006 107.1)"
  dark-card-foreground: "oklch(0.988 0.003 106.5)"
  popover: "oklch(1 0 0)"
  dark-popover: "oklch(0.228 0.013 107.4)"
  popover-foreground: "oklch(0.153 0.006 107.1)"
  dark-popover-foreground: "oklch(0.988 0.003 106.5)"
  secondary: "oklch(0.967 0.001 286.375)"
  dark-secondary: "oklch(0.274 0.006 286.033)"
  secondary-foreground: "oklch(0.21 0.006 285.885)"
  dark-secondary-foreground: "oklch(0.985 0 0)"
  muted: "oklch(0.966 0.005 106.5)"
  dark-muted: "oklch(0.286 0.016 107.4)"
  muted-foreground: "oklch(0.44 0.025 107.3)"
  dark-muted-foreground: "oklch(0.78 0.018 106.9)"
  accent: "oklch(0.966 0.005 106.5)"
  dark-accent: "oklch(0.286 0.016 107.4)"
  accent-foreground: "oklch(0.228 0.013 107.4)"
  dark-accent-foreground: "oklch(0.988 0.003 106.5)"
  border: "oklch(0.93 0.007 106.5)"
  dark-border: "oklch(1 0 0 / 10%)"
  input: "oklch(0.93 0.007 106.5)"
  dark-input: "oklch(1 0 0 / 15%)"
  ring: "oklch(0.48 0.105 223.128)"
  dark-ring: "oklch(0.76 0.1 224.283)"
  destructive: "oklch(0.577 0.245 27.325)"
  dark-destructive: "oklch(0.704 0.191 22.216)"
  chart-2: "oklch(0.645 0.246 16.439)"
  dark-chart-2: "oklch(0.645 0.246 16.439)"
  primary-text: "oklch(0.48 0.105 223.128)"
  completion-text: "oklch(0.49 0.18 16.439)"
  destructive-text: "oklch(0.49 0.2 27.325)"
  dark-primary-text: "oklch(0.76 0.1 224.283)"
  dark-completion-text: "oklch(0.78 0.14 16.439)"
  dark-destructive-text: "oklch(0.82 0.12 22.216)"
typography:
  display:
    fontFamily: "\"Geist Mono Variable\", monospace"
    fontSize: "3rem"
    fontWeight: 900
    lineHeight: 1
  headline:
    fontFamily: "\"Geist Mono Variable\", monospace"
    fontSize: "1.5rem"
    fontWeight: 900
    lineHeight: 1.375
  title:
    fontFamily: "\"Geist Mono Variable\", monospace"
    fontSize: "1rem"
    fontWeight: 800
    lineHeight: 1.375
  panel-title:
    fontFamily: "\"Geist Mono Variable\", monospace"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.375
  body:
    fontFamily: "\"Geist Mono Variable\", monospace"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.625
  ui-body:
    fontFamily: "\"Geist Mono Variable\", monospace"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.625
  label:
    fontFamily: "\"Geist Mono Variable\", monospace"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4285714286
  caption:
    fontFamily: "\"Geist Mono Variable\", monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3333333333
  overline:
    fontFamily: "\"Geist Mono Variable\", monospace"
    fontSize: "0.75rem"
    fontWeight: 900
    lineHeight: 1.3333333333
  zh-body:
    fontFamily: "\"PingFang SC\", \"Microsoft YaHei\", \"Noto Sans CJK SC\", system-ui, sans-serif"
rounded:
  radius: "0px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
  "8": "2rem"
  "10": "2.5rem"
  "12": "3rem"
  "16": "4rem"
  "1.5": "0.375rem"
  "2.5": "0.625rem"
  "3.5": "0.875rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.radius}"
    typography: "{typography.label}"
    height: "2rem"
    padding: "0 0.625rem"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.radius}"
    typography: "{typography.label}"
    height: "2rem"
    padding: "0 0.625rem"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.radius}"
    typography: "{typography.label}"
    height: "2rem"
    padding: "0 0.625rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.radius}"
    typography: "{typography.label}"
    height: "2rem"
    padding: "0 0.625rem"
  button-destructive:
    backgroundColor: "color-mix(in oklab, var(--destructive) 10%, transparent)"
    textColor: "{colors.destructive-text}"
    rounded: "{rounded.radius}"
    typography: "{typography.label}"
    height: "2rem"
    padding: "0 0.625rem"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.radius}"
    typography: "{typography.label}"
    height: "2rem"
    padding: "0 0.625rem"
  input:
    textColor: "{colors.foreground}"
    backgroundColor: "transparent"
    rounded: "{rounded.radius}"
    height: "2rem"
    padding: "0.25rem 0.625rem"
  language-navigation:
    rounded: "{rounded.radius}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.radius}"
    padding: "1rem 0"
  badge:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.radius}"
    typography: "{typography.caption}"
    height: "1.5rem"
    padding: "0.125rem 0.625rem"
---

# Design System: Unmarker.it

## Overview

**Creative North Star: "The Image Workbench"**

Unmarker.it is bold, utilitarian, and assertive. The Image Workbench describes a practical arrangement of tools, visible steps, and clear results. Heavy monospaced headings establish identity; square controls, restrained color, and explicit status labels make the working areas legible.

The composition combines generous space around the image workspace with compact analysis panels. Muted Petrol Blue identifies primary actions and active processing. Light and dark themes use the same structure, while Simplified Chinese substitutes a system sans-serif stack and more accommodating text rhythm. Components are bold, utilitarian, and assertive.

**Key Characteristics:**

- Heavy monospaced English typography with a distinct Chinese text stack.
- Square controls, outlined groups, and a dashed image-selection boundary.
- Muted Petrol Blue actions against warm neutrals; rose completion signals.
- Fluid page width, stacked small-screen content, and a wide two-column workspace.

This record documents the current implementation. Qualitative language was selected with the product owner. Sources are `src/index.css`, `src/components/ui/`, and the application components named below. A read-only sample of the published English homepage at 1280 × 720 confirmed the local primary color, font, square controls, and layout. Dark-theme values and responsive behavior were extracted from source, not visually tested. No local dev-server session was launched.

The frontmatter contains reused tokens, preserving their canonical OKLCH values. Unprefixed color keys map to the light-theme CSS variables; `dark-` keys document the corresponding overrides. Implement components with the semantic CSS variables so themes switch together. The frontmatter typography roles describe small-screen baselines; the following sections document overrides. Unused sidebar colors and unused chart colors are intentionally omitted.

## Colors

Muted Petrol Blue sits against white and warm, slightly olive neutrals; dark mode carries those neutrals into charcoal surfaces.

### Primary

- **Muted Petrol Blue** (`primary` / `dark-primary`): primary buttons, selected language, prominent descriptive text, progress fill, and running-state accents.
- **Ice Text** (`primary-foreground`): pale lettering on solid primary fills in either theme.

Foreground-only variants (`primary-text`, `completion-text`, and `destructive-text`, with dark counterparts) provide contrast on page, card, and tinted status surfaces. Keep these separate from solid button fills: pale button labels remain paired with `primary`.

### Neutral

- **Paper / Warm Charcoal** (`background`, `foreground`, and dark counterparts): the page and primary text exchange light and dark roles.
- **Work Surface** (`card` and `popover`): white in light mode; a lighter charcoal than the page in dark mode. Foreground partners keep text paired to its surface.
- **Quiet Surface** (`muted`, `accent`): inset panels, icon tiles, hover fills, and secondary grouping. Muted text is warm gray; accent text is stronger.
- **Secondary Surface** (`secondary`): a separate neutral button fill, not a second chromatic brand accent.
- **Hairline / Focus** (`border`, `input`, `ring`): separators and boundaries, input strokes, and keyboard focus. Dark border and input tokens are translucent white.

### Status

- **Completion Rose** (`chart-2` fill, `completion-text` lettering): completed pipeline checkmarks and badges. This existing status usage is distinct from the primary accent and must not be silently replaced with green.
- **Alert Red** (`destructive` and its dark override): errors, invalid fields, and destructive/cancel controls. Tinted fills typically use 10–20% opacity.
- Running cards and badges use primary tints; skipped and pending states use muted fills. Local before/after checks also use primary for non-partial results, so completion rose is specific to pipeline-step status.

**The Semantic Color Rule.** Use the existing semantic color variables; active processing, completion, and errors have distinct implemented treatments.

## Typography

**Display, body, and labels (English):** Geist Mono Variable with monospace fallback. The local variable font provides weights 100–900 and a Latin Unicode range. A utility named “sans” still resolves to this locale-aware stack.

**Chinese text:** PingFang SC, Microsoft YaHei, Noto Sans CJK SC, system-ui, sans-serif. Body line-height is 1.65. Chinese text suppresses uppercase transforms except on explicitly monospaced elements; the Latin wordmark stays monospaced.

**Character:** weight and size create hierarchy within one English font family. Titles are forceful, supporting copy is medium weight, and metadata stays compact. There is no single geometric type-scale ratio.

### Hierarchy

| Role | Small-screen baseline | Responsive behavior |
| --- | --- | --- |
| Product wordmark | Display token; uppercase, weight 900, tight single line | Existing breakpoint sizes capped at 14cqi of the header container so the complete wordmark fits |
| Product descriptor | Headline token; weight 900 | 1.875rem at sm; 2.25rem at lg; 3rem at xl; 3.75rem at 2xl |
| Hero supporting copy | 1.25rem, weight 700, line-height 1.375; maximum 36ch | 1.5rem at sm; 1.875rem at xl; 2.25rem at 2xl |
| UI titles | Title token; weight 800 | 1rem baseline; 1.125rem at 2xl |
| Panel titles | Panel-title token; weight 700, balanced wrapping | 1.125rem baseline; 1.25rem at 2xl; compact cards use 1rem |
| Standard supporting prose | Body token; weight 500, line-height 1.625 | 1rem baseline; facts prose reaches 1.125rem at 2xl; maximum 65ch |
| UI descriptions | UI-body token; weight 500 | Stable 1rem / 1.625 line-height; maximum 65ch |
| Captions and overlines | Caption / overline tokens | 0.875rem at sm; 1rem at 2xl; overlines are weight 900 and uppercase |
| Button labels | Label token; weight 500 by default | Main upload, retry, reprocess, and selected navigation contexts use weight 900 |

Chinese hero overrides use `clamp(3rem, 6vw, 6.5rem)` with line-height 1.08; the descriptor uses `clamp(1.5rem, 3vw, 3rem)` / 1.25; hero copy uses `clamp(1.125rem, 2vw, 1.875rem)` / 1.5. These are locale-specific rules, not replacements for the English scale. Panel titles use weight 700; workflow labels use 800. Chinese explanatory text uses 1.7 line-height and a maximum of 36 ideographic characters; Chinese fact titles range from 1.125rem to 1.25rem.

**The Locale-Aware Type Rule.** Preserve the Chinese font and line-height overrides; keep the Latin product wordmark in Geist Mono.

## Layout

The page occupies the available width without a centered maximum-width shell. Horizontal gutter is `clamp(1.25rem, 3vw, 1cm)`. The root font size is 100% of the browser preference, rising to 106.25% from 1536px (16px and 17px with the browser default). Ordinary instructions stay at least 1rem; compact metadata and labels retain their smaller roles. Spacing uses Tailwind’s 0.25rem unit with half-step values where implemented; do not convert the whole system to fixed pixels.

### Current workspace composition

- Small screens stack the header, image workspace, and workflow column in that visual order. The desktop header and workflow share the left column.
- From lg (64rem), the grid is `minmax(28rem, 42%) minmax(0, 1fr)`; from xl (80rem), `minmax(34rem, 45%) minmax(0, 1fr)`; from 1800px, `minmax(52rem, 48%) minmax(0, 1fr)`.
- Main column gap grows from 2rem on small screens to 2.5rem at lg, 3rem at xl, and 4rem at 2xl. Vertical page padding grows from 2rem to 2.5rem at lg and 3rem at 2xl.
- The upload column becomes sticky at 1439px when the viewport is at least 700px tall, offset by the page gutter. The result action bar is separately sticky from lg with a zero top offset.
- The upload region’s minimum height is `min(62vh, 50rem)`, changing to `min(70vh, 50rem)` at lg and `min(72vh, 56rem)` at 2xl.
- Result layouts respond to their available container width, independently of the outer desktop split. Before/after previews form two columns at 40rem; analysis panels split at 52rem; visible/hidden signal tiles split at a panel width of 30rem; verification cells form three columns at 48rem. Narrower containers stack these panels.
- Preview frames have a minimum height and allow loading text to expand; images stay contained with a maximum height of `min(60svh, 24rem)`.
- Result actions stack at workspace widths below 28rem, wrap above that threshold, and share a row with the filename from 52rem. Long button labels, metadata locations, and evidence can wrap.
- The facts section uses a heading/text column and a fact grid at lg; facts become two columns at sm. Footer link groups wrap and become a horizontal arrangement from md.

These are records of existing surfaces, not a mandate that every future page use the same composition. Breakpoints and custom thresholds are mirrored in the sidecar.

## Elevation & Depth

Working surfaces are predominantly flat. A one-pixel outline or ring, muted inset fill, and stronger typography establish grouping. Dark mode adds tonal separation between the charcoal page and lighter cards. Card rings are strokes implemented with CSS box-shadow, not cast elevation.

**The Flat Work Surface Rule.** Keep working panels flat, separated by borders, rings, and tonal changes. Reserve cast shadows for the existing overlays and specific component states.

### Existing exceptions

- The locale suggestion uses Tailwind’s large shadow (`shadow-xl`) as a fixed overlay.
- The available tabs primitive gives the selected default tab a small shadow; line-style tabs remove it. This primitive is present in the library but not imported by the current app screens.
- The metadata panel’s image preview uses a small shadow. The primary before/after comparison uses no cast shadow.
- Buttons and the quality slider use an opaque two-pixel focus outline with a two-pixel offset, using the contrast-safe ring token. Invalid-state rings remain separate from keyboard focus.

Exact shadow values live in `.impeccable/design.json`. Default state transitions use 150ms with `cubic-bezier(0.4, 0, 0.2, 1)`. Result panels appear immediately. Once the processed preview loads, a 460ms frame trace acknowledges the new image, using `cubic-bezier(0.16, 1, 0.3, 1)`. Only the two-pixel frame is clipped and faded; the image stays visible and usable. This signals preview availability, not watermark verification.

Upload feedback uses 120ms border/background changes and a 160ms icon compression while dragging. Keyboard focus receives the same solid boundary and accent treatment without requiring a drag. Progress fills transition only their transform over 200ms. Loading retains existing task-bound spinners and skeletons. No processing or download waits for animation.

Reduced-motion preferences replace the frame trace with a static accent frame, retain the solid upload boundary, and omit icon compression. Smooth scrolling is disabled; other animations and transitions resolve in a single near-instant update. Text continues to communicate progress.

## Shapes

The radius token is zero; all mapped size aliases resolve to that same value. Buttons, inputs, badges, cards, tabs, and skeleton surfaces therefore keep square corners. Borders are normally one pixel. The uploader has a dashed inner boundary, and state markers are small squares.

Exceptions already in the library are the rounded slider track and circular thumb, scrollbar thumb, and the tooltip arrow’s two-pixel rounding. Preserve these as control-specific shapes; they do not establish a rounded-card vocabulary. Phosphor icons supply the functional symbols, often with bold strokes in the workflow and header.

## Components

**Character:** Bold, utilitarian, and assertive.

### Buttons

- Square, inline-flex controls with a transparent one-pixel border; default size and typography are in the frontmatter. Size variants range from 1.5rem to 2.25rem in height, with corresponding square icon-only versions.
- Primary uses Muted Petrol Blue with Ice Text. Primary buttons and button links share the hover treatment, retaining 95% of the fill.
- Outline uses the background and border tokens, turning muted on hover. In dark mode it uses the input token at 30%, rising to 50% on hover.
- Secondary uses neutral secondary colors and an 80% fill on hover. Ghost is transparent with a muted hover fill (50% in dark mode). Link uses the primary-text foreground with an offset underline on hover.
- Destructive uses a translucent destructive fill and a separate destructive-text foreground. It deepens on hover and shares the contrast-safe keyboard focus outline.
- Keyboard focus adds the opaque two-pixel outline; pressed controls move down one pixel unless they declare a popup. Disabled controls are non-interactive at 50% opacity.
- The upload action is full-width below sm, then content-width; its height grows from 2.5rem to 3rem at 2xl. This is an application override, not the primitive default.
- At widths below 640px or when any coarse pointer is available, button targets have a minimum width and height of 44px, including language and theme controls. Fine-pointer desktop sizes remain compact.

### Cards / Containers

- Square Work Surface panels with matching foreground and a one-pixel ring at 10% foreground opacity. Default vertical padding and gap are 1rem; compact cards use 0.75rem.
- Header and content horizontal padding follow the card size. Footer regions use a 50% muted fill, top border, and matching padding.
- Application audit cards often use a 95% card fill; inset evidence tiles use muted fills at 35–50%. No new blur or glass treatment is implied by these opacity modifiers.

### Badges / Status

- Rectangular labels with a thin border, compact padding, and optional icon or square marker. Base size grows from 1.5rem high to 1.75rem at sm.
- Pipeline badges override the primitive with bold uppercase labels. Running uses primary, done uses Completion Rose, error uses destructive, and pending/skipped use muted treatment. Pair color with readable status text.

### Inputs / Fields

- The library input is a square full-width field with a one-pixel input border, transparent light-theme fill, muted placeholder, and a three-pixel focus ring. Dark fill uses the input token at 30%.
- Invalid fields use destructive strokes and rings; disabled fields add muted fill and 50% opacity. Text is 1rem below md and 0.875rem from md.
- This primitive exists for reuse but is not currently imported by the main image workflow. Its documentation does not imply a new text-entry task.
- The JPEG-quality slider uses a thin muted track, primary range, and small circular white thumb with a contrast-safe border, expanded interaction area, hover ring, and opaque focus outline. The value is shown in tabular numerals.
- The focusable slider thumb carries the localized label, explanatory description, and percentage value text.
- Entering the image workspace moves focus to its file name; Start over restores focus to the image-selection button. Initial page load does not autofocus the uploader.
- On narrow screens and coarse-pointer devices, the horizontal slider has a 44px-tall interaction region and a centered 44px thumb hit area. The visible thumb retains its existing size.

### Navigation

- The language selector is a bordered, square two-item group aligned to the header’s end. Selected language uses primary; the other item uses ghost treatment. Labels are weight 900; current-page semantics accompany the selected color.
- Footer navigation is a wrapping row of labeled button links and an icon-only theme toggle. There is no implemented application sidebar or top-level multi-page menu.

### Image Selection and Workflow

- One native, localized button covers the upload region; the central visual action is decorative. Supporting instructions are associated as a description. The group itself adds no keyboard stop.
- The workflow summary is an atomic polite status region. Completed results distinguish successful verification, verification with warnings, and verification unavailable in both locales. Numeric pipeline progress exposes its value and step label; the provenance score uses a named meter.

- The uploader places a large bordered icon tile above centered title, supporting text, action, file-policy copy, and a muted privacy strip. The outer card removes the base ring; its inner boundary is dashed primary at 50%.
- Hover adds a subtle muted outer fill and changes the icon tile to accent. Drag-over changes the fill to primary at 10%, strengthens the dashed boundary, and replaces the icon/title. Disabled state removes interaction and halves opacity.
- Pipeline steps are compact cards with square icon tiles, title/description, a trailing status badge, and a thin progress bar while running. The running card uses a primary border and 10% primary fill.
- Image comparison uses labeled containers with muted preview backgrounds and `object-fit: contain`. Results keep file actions together in a bordered bar and place evidence in separate grouped panels.

## Do's and Don'ts

### Do:

- Do preserve semantic color roles in both light and dark themes.
- Do use the existing locale-aware font stacks and responsive rem-based sizing.
- Do keep primary working panels square, with borders or tonal separation.
- Do pair status color with the existing labels and icons.
- Do keep image previews contained without cropping and retain the working layout’s responsive ordering.
- Do retain visible keyboard focus and the documented hover, pressed, disabled, and invalid states.

### Don't:

- Don’t replace the implemented palette with generic success-green or error-red assumptions; completion currently uses chart-2.
- Don’t replace the Chinese font stack with the Latin-only bundled font.
- Don’t infer a uniform pixel scale from rem values; the root font size changes at two viewport thresholds.
- Don’t turn the square interface into rounded cards or pill buttons during routine extensions.
- Don’t invent a navigation sidebar, decorative background imagery, or a new display font when reproducing this system.
- Don’t treat generated tonal ramps as additional approved application colors.
