---
name: "Unmarker.it"
description: "The Image Workbench: direct, dark, and task focused."
colors:
  primary: "oklch(0.45 0.085 224.283)"
  primary-foreground: "oklch(0.984 0.019 200.873)"
  background: "oklch(0.153 0.006 107.1)"
  foreground: "oklch(0.988 0.003 106.5)"
  card: "oklch(0.228 0.013 107.4)"
  card-foreground: "oklch(0.988 0.003 106.5)"
  popover: "oklch(0.228 0.013 107.4)"
  popover-foreground: "oklch(0.988 0.003 106.5)"
  secondary: "oklch(0.274 0.006 286.033)"
  secondary-foreground: "oklch(0.985 0 0)"
  muted: "oklch(0.286 0.016 107.4)"
  muted-foreground: "oklch(0.78 0.018 106.9)"
  accent: "oklch(0.286 0.016 107.4)"
  accent-foreground: "oklch(0.988 0.003 106.5)"
  border: "oklch(1 0 0 / 10%)"
  input: "oklch(1 0 0 / 15%)"
  ring: "oklch(0.76 0.1 224.283)"
  destructive: "oklch(0.704 0.191 22.216)"
  primary-text: "oklch(0.76 0.1 224.283)"
  destructive-text: "oklch(0.82 0.12 22.216)"
  control-border: "oklch(0.56 0.016 107.4)"
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
  sponsor-card: "0.5rem"
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
    textColor: "{colors.primary-text}"
    rounded: "{rounded.radius}"
    typography: "{typography.label}"
    height: "2rem"
    padding: "0 0.625rem"
  button-secondary:
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.radius}"
    typography: "{typography.label}"
    height: "2rem"
    padding: "0 0.625rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.primary-text}"
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
  sponsor-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.sponsor-card}"
    padding: "0.625rem"
  language-navigation:
    rounded: "{rounded.radius}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.radius}"
    padding: "1rem 0"
  badge:
    backgroundColor: "transparent"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.radius}"
    typography: "{typography.caption}"
    padding: "0.125rem 0"
---

# Design System: Unmarker.it

## Overview

**Creative North Star: "The Image Workbench"**

Unmarker.it presents image work as a visible sequence: choose an image, read the scan, follow processing, compare the output, and act on the result. The interface is direct and dense where evidence matters, with strong type and clear boundaries around the workspace. Its current visual world is dark only.

The tool uses square controls and flat charcoal panels. Muted petrol blue marks actions, focus, and progress. Sponsorship and checkout now support the tool: narrow sponsor rails frame the desktop workspace, compact strips frame it on mobile, and a restrained form handles booking. Rounded sponsor cards and chips are a local exception to the square workbench.

**Key Characteristics:**

- Heavy monospaced English headings and a separate Simplified Chinese text stack.
- Dark charcoal surfaces, pale text, petrol blue actions, and thin boundaries.
- A broad image workspace with compact, inspectable evidence panels.
- Sponsor placements at the edges of the tool and a narrow booking form.

This record refreshes the previously chosen Image Workbench language from `src/index.css`, `src/App.tsx`, `src/WorkflowApp.tsx`, `src/SponsorshipPage.tsx`, and `src/components/`. The image queue extension was reviewed in local Chromium at desktop and mobile sizes in both locales. Frontmatter tokens are normative; prose explains use and responsive exceptions.

## Colors

The application uses one dark palette. CSS declares `color-scheme: only dark`; the former light values are no longer part of the implemented system.

### Primary

- **Muted Petrol Blue** (`primary`): filled actions, running workflow surfaces, progress, and selected navigation. Its pale partner (`primary-foreground`) is text on the solid fill.
- **Ice Blue** (`primary-text`): links, outlined and ghost actions, status text, and strong focus or dropzone boundaries. `ring` uses the same hue family for keyboard focus.

### Neutral

- **Charcoal Page** (`background`) and **Pale Ink** (`foreground`): the outer canvas and main text.
- **Raised Charcoal** (`card`, `popover`) with their foreground partners: working panels, menus, sponsor cards, and result containers.
- **Quiet Charcoal** (`muted`, `accent`) and **Soft Gray** (`muted-foreground`): inset areas, supporting copy, and lower-priority states.
- **Hairline White** (`border`, `input`) and **Firm Control Stroke** (`control-border`): panel separation and field boundaries. The control stroke is stronger than the general hairline.
- `secondary` remains a library color token; the current secondary button variant visually matches the outlined blue button.

### Status

- **Alert Coral** (`destructive`, `destructive-text`): errors and cancel actions; destructive fills are translucent.
- Done and running pipeline labels both use `primary-text`; errors use `destructive-text`; pending and skipped use `muted-foreground`. Status text and icons carry meaning alongside color.

**The Semantic Color Rule.** Use CSS semantic variables so surfaces, foregrounds, and focus colors stay paired. Do not revive the retired light palette or assign an unused chart color to completion.

## Typography

**English display, body, and controls:** Geist Mono Variable with monospace fallback. The local variable font covers Latin glyphs and weights 100–900. The `font-sans` utility resolves to the locale-aware body stack, not a separate sans family.

**Simplified Chinese:** PingFang SC, Microsoft YaHei, Noto Sans CJK SC, then system sans-serif. Chinese copy has looser line-height, suppresses automatic uppercase except on explicit mono text, and keeps the Latin wordmark monospaced.

**Character:** Weight and scale establish hierarchy within the English monospace system. Long descriptions keep a readable body size; compact labels are reserved for status and controls.

### Hierarchy

| Role | Small-screen baseline | Observed expansion |
| --- | --- | --- |
| Wordmark / display | 3rem, weight 900, line-height 1 | Scales with its header container and larger breakpoints; stays on one line |
| Product descriptor | 1.5rem, weight 900, line-height 1.375 | Reaches 3.75rem at 2xl; sponsor rails constrain the desktop title to `clamp(3rem, 3.8vw, 6rem)` |
| UI title | 1rem, weight 800 | 1.125rem at 2xl |
| Card title | 1.125rem, weight 700 | 1.25rem at 2xl |
| Reading body | 1rem, weight 500, line-height 1.625 | 1.125rem for large facts text; prose commonly capped at 65ch |
| Label / caption | 0.875rem / 0.75rem | Small labels expand at sm and 2xl |

Chinese hero titles use `clamp(3rem, 6vw, 6.5rem)` at 1.08 line-height. Explanatory copy uses 1.7 line-height and a 36-ideograph measure. The sponsorship page has its own compact hierarchy: title `clamp(1.75rem, 1.5rem + 1vw, 2rem)`, 1rem body, 0.875rem labels, and tabular numeric prices.

**The Locale-Aware Type Rule.** Keep the Chinese fallback stack and generous text rhythm. Preserve the Latin wordmark in Geist Mono.

## Layout

The image tool fills available width with a gutter of `clamp(1.25rem, 3vw, 1cm)`. Root type respects the browser default and rises to 106.25% from 1536px. The main grid stacks on small screens. At 64rem it divides into `minmax(28rem, 42%) minmax(0, 1fr)`; at 80rem it uses `minmax(34rem, 45%) minmax(0, 1fr)`; at 1800px it uses `minmax(52rem, 48%) minmax(0, 1fr)` before sponsor rails constrain the first column. The left side holds the header and workflow; the right side holds upload or result content. The idle uploader can become sticky at 1439px when the viewport is at least 700px tall.

The upload region stays tall (`min(62vh, 50rem)` on small screens, rising at larger widths). Result panels use container queries: comparison previews split at a 40rem container, analysis panels at 52rem, and verification cells at 48rem. Image previews use `object-fit: contain` and bounded height. Long evidence and action labels may wrap.

After image selection, the queue and batch actions stay in normal document flow. The left column groups the header, queue, ZIP export/reset and JPEG quality; the right column holds the selected result and individual actions. Mobile stacks these groups in the same DOM order, keeping batch export before the long result report. Sponsor strips retain their existing safe-area behavior.

Sponsor rails appear on both sides from 1440px, each about 12–13rem wide, and narrow the center. Below that width, sponsors appear in top and/or bottom strips with safe-area padding; controls sit in page flow. The booking page uses a maximum 36rem content column inside a wider header/footer shell. Static legal documents use a separate 78ch reading column. These are surface-specific compositions, not a universal container width.

## Elevation & Depth

The working interface is mostly flat. Tonal separation, one-pixel borders, card rings, and strong typography define layers. Cast shadows are reserved for floating surfaces: the consent banner, locale suggestion, and select overlays. The preview frame traces in for 460ms when the processed image is ready; the image remains visible. Sponsor cards may flip on desktop, and mobile sponsor strips scroll; both pause for interaction and resolve to static content under reduced motion.

**The Flat Work Surface Rule.** Keep task panels flat at rest. Use borders and fill before cast shadow; reserve shadow for content floating over the page.

Reduced-motion preferences disable the frame trace and sponsor movement. Drag feedback and focus retain a solid boundary, and status copy remains visible without animation.

## Shapes

The core radius token is zero. Buttons, inputs, workbench cards, alerts, and the image workspace are square, with mostly one-pixel borders. The uploader's inner boundary is dashed; drag or focus makes it solid. Slider thumbs and small badge dots are circular control details.

Sponsor cards and mobile chips use a local 0.5rem radius. The advertising placeholder uses the same rounded silhouette with a dashed border. This exception marks sponsor content as a separate surface; it does not change workbench primitives.

## Components

### Buttons

- Default buttons are square, 2rem high, and use filled petrol blue with pale text. Hover retains about 95% of the fill; keyboard focus draws a two-pixel outline; pressing moves the control down one pixel.
- Outline and secondary variants share a petrol border, page background, blue text, and a 10% petrol hover fill. Ghost and link variants use underlined blue text, with stronger underline on hover. Destructive uses coral text over a translucent coral fill.
- Sizes range from 1.5rem to 2.25rem before application overrides. Narrow screens and coarse pointers give buttons at least a 44px hit target. Workflow actions wrap as groups and preserve named text controls on mobile.

### Cards / Containers

- Task cards are square raised-charcoal panels with a faint ring or border, 1rem internal spacing, and optional muted footer fill. Running pipeline cards use a petrol border and tint. The uploader uses a dashed inner selection boundary.
- Sponsor cards are rounded and centered inside fixed side-rail slots. Their name and claim can wrap, and long claims scroll within the card. Mobile sponsor chips are compact rounded links. Sponsor content stays visually subordinate to the image task.

### Badges / Status

- The badge primitive is unboxed text with a small circular dot; an explicit icon replaces the dot. Default status is blue, secondary is muted, and destructive is coral. Pipeline status adds readable labels and a spinner while running.
- Workflow progress appears as a thin bar only for the running step. Summaries and verification panels use written status alongside color.

### Inputs / Fields

- The input primitive is square, transparent, 2rem high, and bounded by the firm control stroke. Focus adds a visible ring. Disabled fields use a muted fill and reduced opacity.
- The sponsorship form uses field labels, descriptions, inline validation, selects, checkboxes, an attachment control, and a two-step creative/billing progression. Long translations wrap. On narrow screens and coarse pointers, fields and controls grow to at least 44px; text fields use at least 16px text to avoid mobile zoom.
- The JPEG quality slider uses a thin muted track, blue range, circular thumb, visible value, and a 44px interaction region on touch devices.

### Navigation and overlays

- The language selector is a square two-item group in the header. Current-page semantics accompany selection. Footer links wrap, and static legal pages retain the dark tokens with a narrower reading column.
- Consent uses a compact bordered floating banner and a separate preferences dialog. Actions wrap on narrow screens; focus returns to the triggering control when the dialog closes.

### Image selection and comparison

- The entire uploader is one labeled file-selection button. Drag and focus strengthen its boundary; the central visual action is decorative. The processing view retains a file label, before/after contained previews, and grouped evidence panels.
- Batch controls provide pause, cancel unfinished, ZIP download and reset. The selected result provides cancel, retry, reprocess, JPEG download and metadata-copy actions according to its state. Actions stay in normal document flow on mobile and desktop.

## Do's and Don'ts

### Do:

- Do use dark semantic color pairs and the stronger control stroke for fields.
- Do keep the workbench square while allowing the documented rounded sponsor cards and chips.
- Do preserve locale-aware typography, 44px touch targets, and visible focus.
- Do let evidence, long translations, and action labels wrap without clipping.
- Do respect the existing safe-area offsets of sponsor strips and consent overlays. Keep workflow controls in flow.

### Don't:

- Don't reintroduce the retired light theme or use an unused chart token as completion color.
- Don't crop image comparisons or let sponsor placements displace the image action.
- Don't make sponsor motion necessary to read a link or use the flip effect under reduced motion.
- Don't infer rounded task cards from rounded sponsor placements.

## Image queue extension

The processing view extends the existing workbench without changing tokens,
branding or sponsor framing. The left column contains a compact selectable file
list, queue controls and quality for new attempts. The right column contains the
selected result and its actions. On mobile, queue, ZIP/reset and quality precede the selected
result in matching DOM and visual order; actions remain in flow rather than covering content. File rows use text
status plus color, visible focus and 44px removal targets. Progress announces
finished counts and the active filename, without a fabricated overall percentage.

C2PA evidence uses a definition list for declared origin, local integrity and
signer trust. Origin evidence is categorical, with no AI probability meter.
No new raster imagery is introduced by this extension.

## Workflow composition and async actions

`WorkspaceFrame` owns the common tool grid and footer for idle, loading and batch
views. It preserves each view's existing spacing and DOM order. `SponsorLayout`
remains mounted above that boundary; sponsor placements and checkout are unchanged.
The shared dark tokens live in `src/styles/theme.css`; locale typography, touch
targets, image feedback and workspace utilities live in `src/styles/workspace.css`.
Sponsor and legal rules remain in `src/index.css` with the existing overlay offsets.
The removed mobile workflow toolbar has no remaining styles or reserved height.

Metadata-copy creation and ZIP export reserve the queue through one operation
controller. While reserved, add, retry, remove, resume, reset and another heavy
action are unavailable. Selecting and inspecting an existing result remains
available. A metadata cleanup shows the source filename and a cancel action in
the batch controls, so it stays reachable after a selection change. Cancellation
keeps the reservation until work settles and suppresses late downloads. An
operation never changes the user's queue pause choice.

Action notices retain message descriptors and translate on render, including
metadata warnings, so changing language updates an existing notice. Exhaustive
presentation selectors map queue and scan states to controls and labels;
unavailable or partial output checks remain visibly incomplete, and hidden
watermark results remain unverified.
