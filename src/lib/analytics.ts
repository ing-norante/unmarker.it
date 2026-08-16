import type { BeforeSendFn, CaptureResult } from "posthog-js";

import type { SupportedLocale } from "@/i18n/locales";

// Errors that browser extensions and in-app browsers inject, not our bundle.
// Page-translation extensions mutate DOM nodes that React owns, so React
// throws insertBefore / removeChild NotFoundError. The other patterns name
// globals that only foreign scripts define.
const FOREIGN_SCRIPT_ERROR_PATTERNS: readonly RegExp[] = [
  /Failed to execute '(insertBefore|removeChild)' on 'Node'/i,
  /__KVARS__/,
  /cashbackReminder/,
  /LIDNotifyId/,
];

interface ExceptionStackFrame {
  in_app?: boolean;
}

interface ExceptionListItem {
  type?: string;
  value?: string;
  stacktrace?: { frames?: ExceptionStackFrame[] };
}

function isForeignScriptException(event: CaptureResult): boolean {
  const exceptions = event.properties?.$exception_list;
  if (!Array.isArray(exceptions)) {
    return false;
  }

  const list = exceptions as ExceptionListItem[];

  const text = list
    .map((item) => `${item?.type ?? ""}: ${item?.value ?? ""}`)
    .join("\n");
  if (FOREIGN_SCRIPT_ERROR_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  // A cross-origin script gives the browser no stack frames to share, so
  // nothing resolves to our own assets. Keep an event with at least one
  // in-app frame; drop the rest.
  const frames = list.flatMap((item) => item?.stacktrace?.frames ?? []);
  return !frames.some((frame) => frame?.in_app === true);
}

// Drop $exception events that come from foreign scripts. Pass every other
// event through unchanged.
export const dropForeignScriptExceptions: BeforeSendFn = (event) => {
  if (event?.event === "$exception" && isForeignScriptException(event)) {
    return null;
  }
  return event;
};

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

let posthogPromise: Promise<typeof import("posthog-js").default | null> | null =
  null;

function getPostHog() {
  if (typeof window === "undefined") {
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
        before_send: dropForeignScriptExceptions,
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
) {
  const posthog = await getPostHog();
  posthog?.capture("action_clicked", { action, component });
}
