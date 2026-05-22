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

let posthogPromise: Promise<typeof import("posthog-js").default | null> | null =
  null;

function getPostHog() {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  const apiKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
  const apiHost = import.meta.env.VITE_PUBLIC_POSTHOG_API_HOST;
  const uiHost = import.meta.env.VITE_PUBLIC_POSTHOG_UI_HOST;
  if (!apiKey) {
    return Promise.resolve(null);
  }

  posthogPromise ??= import("posthog-js").then(({ default: posthog }) => {
    posthog.init(apiKey, {
      ...(apiHost ? { api_host: apiHost } : {}),
      ...(uiHost ? { ui_host: uiHost } : {}),
      defaults: "2025-05-24",
      capture_exceptions: true,
      debug: import.meta.env.MODE === "development",
    });

    return posthog;
  });

  return posthogPromise;
}

export function trackAction(
  action: TrackingAction,
  component: TrackingComponent,
) {
  // Keep analytics file-agnostic: action events must not include file names,
  // MIME types, dimensions, hashes, or other image-derived values.
  void getPostHog().then((posthog) => {
    posthog?.capture("action_clicked", {
      action,
      component,
    });
  });
}
