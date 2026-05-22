import type { PostHog } from "posthog-js";

export type TrackingAction =
  | "cancel_processing"
  | "download_processed"
  | "download_metadata_clean"
  | "feature_board_link"
  | "github_repo_link"
  | "research_arxiv_link"
  | "research_waterloo_link"
  | "process_image"
  | "analysis_only"
  | "postflight_complete"
  | "preflight_complete"
  | "processing_complete"
  | "reprocess_started"
  | "reset"
  | "upload_image"
  | "workflow_cancelled"
  | "workflow_error"
  | "workflow_started";

export type TrackingComponent =
  | "action_bar"
  | "footer"
  | "image_comparison"
  | "uploader"
  | "workflow";

export function trackAction(
  posthog: PostHog | null | undefined,
  action: TrackingAction,
  component: TrackingComponent,
) {
  // Keep analytics file-agnostic: action events must not include file names,
  // MIME types, dimensions, hashes, or other image-derived values.
  posthog?.capture("action_clicked", {
    action,
    component,
  });
}
