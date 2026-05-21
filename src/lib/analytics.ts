import type { PostHog } from "posthog-js";

export type TrackingAction =
  | "cancel_processing"
  | "download_processed"
  | "feature_board_link"
  | "github_repo_link"
  | "research_arxiv_link"
  | "research_waterloo_link"
  | "process_image"
  | "reset"
  | "upload_image";

export type TrackingComponent =
  | "action_bar"
  | "footer"
  | "image_comparison"
  | "uploader";

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
