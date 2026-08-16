import type { SupportedLocale } from "@/i18n/locales";

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
  | "preflight_started"
  | "postflight_complete"
  | "preflight_complete"
  | "processing_started"
  | "processing_complete"
  | "reprocess_started"
  | "reset"
  | "upload_image"
  | "workflow_cancelled"
  | "workflow_error"
  | "workflow_validation_failed"
  | "workflow_completed"
  | "workflow_started"
  | "locale_switched"
  | "locale_suggestion_shown"
  | "locale_suggestion_accepted"
  | "locale_suggestion_dismissed";

export type TrackingComponent =
  | "action_bar"
  | "footer"
  | "image_comparison"
  | "language_switcher"
  | "locale_suggestion"
  | "uploader"
  | "workflow";

export type AnalyticsProperty = string | number | boolean | null;
export type AnalyticsProperties = Record<string, AnalyticsProperty>;

export const ANALYTICS_SCHEMA_VERSION = 2;

const semanticEvents: Record<TrackingAction, string> = {
  analysis_only: "analysis_only_completed",
  cancel_processing: "processing_cancel_requested",
  download_metadata_clean: "metadata_clean_downloaded",
  download_processed: "processed_image_downloaded",
  feature_board_link: "outbound_link_clicked",
  github_repo_link: "outbound_link_clicked",
  locale_suggestion_accepted: "locale_suggestion_accepted",
  locale_suggestion_dismissed: "locale_suggestion_dismissed",
  locale_suggestion_shown: "locale_suggestion_shown",
  locale_switched: "locale_changed",
  postflight_complete: "postflight_completed",
  preflight_complete: "preflight_completed",
  preflight_started: "preflight_started",
  process_image: "retry_started",
  processing_complete: "processing_completed",
  processing_started: "processing_started",
  reprocess_started: "reprocess_started",
  research_arxiv_link: "outbound_link_clicked",
  research_waterloo_link: "outbound_link_clicked",
  reset: "workflow_reset",
  upload_image: "upload_selected",
  workflow_cancelled: "workflow_cancelled",
  workflow_completed: "workflow_completed",
  workflow_error: "workflow_failed",
  workflow_started: "workflow_started",
  workflow_validation_failed: "workflow_validation_failed",
};

export function getSemanticEventName(action: TrackingAction) {
  return semanticEvents[action];
}

let posthogPromise: Promise<typeof import("posthog-js").default | null> | null =
  null;

function isLocalhost() {
  const { hostname } = window.location;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

function getPostHog() {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  // Skip PostHog on localhost so local exceptions do not reach production
  // error tracking as if they were real user errors.
  if (isLocalhost()) {
    return Promise.resolve(null);
  }

  const apiKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
  const apiHost =
    import.meta.env.VITE_PUBLIC_POSTHOG_API_HOST ||
    import.meta.env.VITE_PUBLIC_POSTHOG_HOST;
  const uiHost = import.meta.env.VITE_PUBLIC_POSTHOG_UI_HOST;
  if (!apiKey) {
    return Promise.resolve(null);
  }

  posthogPromise ??= import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(apiKey, {
        ...(apiHost ? { api_host: apiHost } : {}),
        ...(uiHost ? { ui_host: uiHost } : {}),
        defaults: "2025-05-24",
        capture_pageview: false,
        capture_exceptions: true,
        debug: import.meta.env.MODE === "development",
      });

      return posthog;
    })
    .catch((error: unknown) => {
      posthogPromise = null;

      if (import.meta.env.MODE === "development") {
        console.warn("PostHog failed to initialize", error);
      }

      return null;
    });

  return posthogPromise;
}

export async function initAnalytics(locale: SupportedLocale) {
  const posthog = await getPostHog();
  posthog?.register({ locale });
  posthog?.capture("$pageview");
}

export function trackAction(
  action: TrackingAction,
  component: TrackingComponent,
  properties: AnalyticsProperties = {},
) {
  // Keep analytics file-agnostic: action events must not include file names,
  // MIME types, dimensions, hashes, or other image-derived values.
  void getPostHog().then((posthog) => {
    captureAction(posthog, action, component, properties);
  });
}

function captureAction(
  posthog: typeof import("posthog-js").default | null,
  action: TrackingAction,
  component: TrackingComponent,
  properties: AnalyticsProperties,
) {
  if (!posthog) return;

  const eventProperties = {
    ...properties,
    action,
    component,
    analytics_schema_version: ANALYTICS_SCHEMA_VERSION,
  };

  // Semantic events are the canonical v2 taxonomy. Keep the legacy envelope
  // during migration so existing PostHog insights retain their history.
  posthog.capture(getSemanticEventName(action), eventProperties);
  posthog.capture("action_clicked", {
    ...eventProperties,
    legacy_compatibility_event: true,
  });
}

export async function captureException(error: unknown) {
  const posthog = await getPostHog();
  posthog?.captureException(error);
}

export async function registerAnalyticsLocale(locale: SupportedLocale) {
  const posthog = await getPostHog();
  posthog?.register({ locale });
}

export async function capturePageview() {
  const posthog = await getPostHog();
  posthog?.capture("$pageview");
}

export async function trackLocaleAction(
  action:
    | "locale_switched"
    | "locale_suggestion_shown"
    | "locale_suggestion_accepted"
    | "locale_suggestion_dismissed",
  component: "language_switcher" | "locale_suggestion",
  properties: AnalyticsProperties = {},
) {
  const posthog = await getPostHog();
  captureAction(posthog, action, component, properties);
}
