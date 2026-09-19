export const batch = {
  cleaningMetadata: "Cleaning metadata for {{name}}…",
  cancelCleanup: "Cancel cleanup",
  title: "Image queue",
  add: "Add images",
  empty: "Add images to start a new batch.",
  summary: "{{done}} / {{total}} finished",
  active: "Working on {{name}}",
  paused: "Queue paused",
  idle: "Queue finished",
  pause: "Pause queue",
  resume: "Resume queue",
  cancelAll: "Cancel unfinished",
  clear: "Start over",
  pauseHelp:
    "Pause lets the current image finish. Cancel interrupts unfinished images.",
  limits: "Up to 20 files · 200 MB of inputs · 128 MB of outputs",
  qualityHelp:
    "Quality applies to new images and retries. Queued images keep their settings.",
  memory: "{{mb}} MB of outputs retained in this tab",
  status: {
    waiting: "Waiting",
    running: "Processing",
    completed: "Ready",
    "completed-with-warnings": "Ready with warnings",
    "analysis-only": "Analysis only",
    failed: "Failed",
    cancelled: "Cancelled",
    rejected: "Unsupported input",
  },
  select: "Inspect {{name}}",
  remove: "Remove {{name}}",
  retry: "Retry from original",
  reprocess: "Reprocess original",
  cancel: "Cancel image",
  download: "Download JPEG",
  zip: "Download ZIP ({{count}})",
  exporting: "Preparing ZIP…",
  cancelExport: "Cancel export",
  exportHelp:
    "ZIP includes completed JPEGs and a local report. Originals and unfinished images are excluded.",
  exportFailed:
    "The ZIP could not be created. Retry, or download the JPEGs individually.",
  downloadStarted: "Download started. Check your browser downloads.",
  metadata: "Download metadata-clean copy",
  metadataHelp:
    "Original format; pixels are unchanged. Some display metadata may be retained.",
  failed:
    "This image could not finish. Retry from the original or try a smaller file.",
  admissionLimit:
    "{{count}} file(s) were not added. Keep up to {{max}} files and {{mb}} MB of inputs; remove entries to add more.",
  outputLimit:
    "The {{mb}} MB output limit was reached. Download and remove completed entries, then retry this image and resume.",
  waiting: "This image will be analyzed when its turn starts.",
  cancelled:
    "Processing was cancelled. Retry to start again from the original.",
  reportOnly: "No JPEG was generated. Review the analysis and warnings below.",
};
export const c2pa = {
  title: "Content Credentials",
  description:
    "Credentials describe provenance. Their presence alone does not mean an image is AI-generated.",
  originLabel: "Declared origin",
  integrityLabel: "Local integrity",
  trustLabel: "Signer trust",
  trust: "Not evaluated",
  origin: {
    photograph: "Photographic capture declared",
    "ai-generated": "AI generation declared",
    composite: "Composite creation declared",
    unknown: "Not established",
  },
  integrity: {
    valid: "Local checks passed",
    invalid: "Local checks failed",
    unknown: "Not established",
  },
  presence: {
    present: "Embedded credentials",
    referenced: "Credential reference",
    "not-found": "Not found",
  },
  reason: {
    "remote-disabled": "Remote credentials are not fetched.",
    "trust-not-evaluated":
      "Signer trust and online revocation are not checked.",
    "invalid-manifest": "The local manifest did not pass validation.",
    "reader-unavailable": "The local reader is unavailable in this browser.",
    "read-failed": "Credentials could not be read.",
    timeout: "The local read timed out.",
  },
};
