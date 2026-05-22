import type { WorkflowPhase } from "@/lib/types";

export function getBusyCopy(phase: WorkflowPhase) {
  switch (phase) {
    case "preflight-scanning":
      return "Analyzing metadata and local pixel signals...";
    case "processing":
      return "Processing in progress...";
    case "postflight-scanning":
      return "Verifying processed JPEG...";
    default:
      return "Working...";
  }
}

export function getPhaseTitle(phase: WorkflowPhase) {
  switch (phase) {
    case "idle":
      return "Ready";
    case "preflight-scanning":
      return "Analyzing";
    case "analysis-only":
      return "Analysis only";
    case "processing":
      return "Removing watermarks";
    case "postflight-scanning":
      return "Verifying";
    case "complete":
      return "Complete";
    case "error":
      return "Needs attention";
    case "cancelled":
      return "Cancelled";
  }
}

export function getPhaseDescription(phase: WorkflowPhase) {
  switch (phase) {
    case "idle":
      return "Upload an image to start the local audit and automatic workflow.";
    case "preflight-scanning":
      return "Reading metadata and checking for visible Gemini-style marks.";
    case "analysis-only":
      return "This file can be analyzed, but it is not processable by the browser canvas pipeline.";
    case "processing":
      return "The local shake, stir, crush, and visible-restore steps are running.";
    case "postflight-scanning":
      return "The generated JPEG is being scanned again for before/after verification.";
    case "complete":
      return "The processed JPEG is ready and the verification diff is available.";
    case "error":
      return "The workflow stopped before producing a verified JPEG.";
    case "cancelled":
      return "The current run was cancelled. Reset or retry to continue.";
  }
}
