---
version: 1
slug: "src-workflowapp-tsx"
primary_target: "src/WorkflowApp.tsx"
related_targets: ["src/components/BatchQueuePanel.tsx","src/components/BatchResult.tsx","src/components/WorkspaceFrame.tsx"]
---

## Direction contract

THESIS: Extend the Image Workbench to a local image queue. Each file keeps its own outcome and evidence.

OWN-WORLD: Preserve charcoal surfaces, square controls, Geist Mono, petrol actions, ice-blue focus, existing header and sponsor framing.

STORY: Select images, follow one active job, inspect any result without interrupting processing, then download individual outputs or a ZIP with a local report.

FIRST VIEWPORT: Existing two-column shell; header and compact selectable queue on the left, selected image details and download actions on the right. Mobile stacks queue before details. Pause finishes the current image; cancel interrupts explicitly. Status changes and selected-row focus are the signature interaction, with existing restrained progress motion and reduced-motion support.

FORM: Established implementation extension in Operate mode; no new concept, ordered direction lottery or seed required.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Refactor invariants

Preserve the existing desktop/mobile composition, tokens, image sizing, bilingual
copy and stable sponsor framing. Metadata cleanup and ZIP export share one queue
reservation; a visible cancel action remains available even after selecting
another result. Preserve the user's pause state and suppress late downloads after
cancellation or unmount. Notices translate in the current locale. No new image
assets or visual direction are introduced.
