import { hasAnalyticsConsent } from "@/lib/cookieConsent";
import { trackSponsorEvent, type AnalyticsProperties } from "@/lib/analytics";
import {
  markSponsorSeen,
  resetSponsorSeen,
} from "@/lib/sponsorAnalyticsContext";
import {
  SponsorViewability,
  SPONSOR_MIN_VISIBLE_MS,
  SPONSOR_MIN_VISIBLE_RATIO,
} from "@/lib/sponsorViewability";
import type { Sponsor } from "@/lib/sponsors";

export interface SponsorPlacement {
  location: "desktop_left" | "desktop_right" | "mobile_top" | "mobile_bottom";
  position: number;
  face: "single" | "front" | "back" | "chip";
}

function createId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

let ledger = new SponsorViewability(createId);
let pageViewId: string | null = null;

function getPageViewId() {
  pageViewId ??= createId();
  return pageViewId;
}

function placementKey(sponsor: Sponsor, placement: SponsorPlacement) {
  return JSON.stringify([
    sponsor.id,
    placement.location,
    placement.position,
    placement.face,
  ]);
}

export function sponsorTrackingAttributes(
  sponsor: Sponsor,
  placement: SponsorPlacement,
) {
  return {
    "data-sponsor-key": placementKey(sponsor, placement),
    "data-sponsor-id": sponsor.id,
    "data-sponsor-kind": sponsor.kind ?? "paid",
    "data-sponsor-location": placement.location,
    "data-sponsor-position": placement.position,
    "data-sponsor-face": placement.face,
  };
}

function properties(
  sponsor: Sponsor,
  placement: SponsorPlacement,
): AnalyticsProperties {
  return {
    sponsor_id: sponsor.id,
    sponsor_kind: sponsor.kind ?? "paid",
    sponsor_location: placement.location,
    sponsor_position: placement.position,
    sponsor_face: placement.face,
    sponsor_placement: `${placement.location}:${placement.position}:${placement.face}`,
    sponsor_page_view_id: getPageViewId(),
  };
}

export function trackSponsorClick(
  sponsor: Sponsor,
  placement: SponsorPlacement,
) {
  if (!hasAnalyticsConsent()) return;
  const attribution = ledger.click(placementKey(sponsor, placement));
  trackSponsorEvent("sponsor_clicked", {
    ...properties(sponsor, placement),
    sponsor_impression_id: attribution.impressionId,
    has_viewable_impression: attribution.impressionId !== null,
    first_click_for_placement: attribution.firstClick,
    first_click_for_impression: attribution.firstImpressionClick,
  });
}

/** Conservative geometric viewability, including clipping and modal occlusion. */
export function isSponsorVisible(element: HTMLElement) {
  if (document.visibilityState !== "visible" || !element.isConnected)
    return false;
  const style = getComputedStyle(element);
  if (
    style.visibility !== "visible" ||
    Number(style.opacity) === 0 ||
    !element.getClientRects().length
  )
    return false;
  const rect = element.getBoundingClientRect();
  // Use the untransformed area too, so an edge-on flipping card doesn't qualify.
  const area = Math.max(
    rect.width * rect.height,
    element.offsetWidth * element.offsetHeight,
  );
  if (area <= 0) return false;
  let left = Math.max(0, rect.left);
  let right = Math.min(window.innerWidth, rect.right);
  let top = Math.max(0, rect.top);
  let bottom = Math.min(window.innerHeight, rect.bottom);

  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const parentStyle = getComputedStyle(parent);
    if (Number(parentStyle.opacity) === 0) return false;
    const clipsX = /hidden|clip|scroll|auto/.test(parentStyle.overflowX);
    const clipsY = /hidden|clip|scroll|auto/.test(parentStyle.overflowY);
    if (!clipsX && !clipsY) continue;
    const bounds = parent.getBoundingClientRect();
    if (clipsX) {
      left = Math.max(left, bounds.left);
      right = Math.min(right, bounds.right);
    }
    if (clipsY) {
      top = Math.max(top, bounds.top);
      bottom = Math.min(bottom, bounds.bottom);
    }
  }

  if (
    (Math.max(0, right - left) * Math.max(0, bottom - top)) / area <
    SPONSOR_MIN_VISIBLE_RATIO
  )
    return false;
  // A dialog or another element covering the visible center invalidates exposure.
  const topElement = document.elementFromPoint(
    (left + right) / 2,
    (top + bottom) / 2,
  );
  return topElement !== null && element.contains(topElement);
}

/** One observer and one foreground timer for all placements, including marquee copies. */
export function observeSponsors(root: HTMLElement) {
  const elements = Array.from(
    root.querySelectorAll<HTMLElement>("[data-sponsor-key]"),
  );
  const candidates = new Set<HTMLElement>();
  const observer =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const element = entry.target as HTMLElement;
              if (
                entry.isIntersecting &&
                entry.intersectionRatio >= SPONSOR_MIN_VISIBLE_RATIO
              )
                candidates.add(element);
              else candidates.delete(element);
            }
          },
          { threshold: [0, SPONSOR_MIN_VISIBLE_RATIO, 1] },
        );
  for (const element of elements) {
    if (observer) observer.observe(element);
    else candidates.add(element);
  }

  const sample = () => {
    if (!hasAnalyticsConsent()) {
      ledger.resetContinuity();
      return;
    }
    const visible = new Map<string, HTMLElement>();
    for (const element of candidates) {
      if (isSponsorVisible(element))
        visible.set(element.dataset.sponsorKey!, element);
    }
    const now = performance.now();
    const keys = new Set(
      elements.map((element) => element.dataset.sponsorKey!),
    );
    for (const key of keys) {
      const element = visible.get(key);
      const impressionId = ledger.sample(key, !!element, now);
      if (!impressionId || !element) continue;
      markSponsorSeen();
      trackSponsorEvent("sponsor_impression", {
        sponsor_id: element.dataset.sponsorId!,
        sponsor_kind: element.dataset.sponsorKind!,
        sponsor_location: element.dataset.sponsorLocation!,
        sponsor_position: Number(element.dataset.sponsorPosition),
        sponsor_face: element.dataset.sponsorFace!,
        sponsor_placement: `${element.dataset.sponsorLocation}:${element.dataset.sponsorPosition}:${element.dataset.sponsorFace}`,
        sponsor_page_view_id: getPageViewId(),
        sponsor_impression_id: impressionId,
        minimum_visible_ratio: SPONSOR_MIN_VISIBLE_RATIO,
        minimum_visible_ms: SPONSOR_MIN_VISIBLE_MS,
      });
    }
  };

  let timer: ReturnType<typeof setInterval> | undefined;
  const updateVisibility = () => {
    clearInterval(timer);
    ledger.resetContinuity();
    if (document.visibilityState === "visible") {
      sample();
      timer = setInterval(sample, 200);
    }
  };
  const newPageView = () => {
    ledger = new SponsorViewability(createId);
    pageViewId = null;
    resetSponsorSeen();
    updateVisibility();
  };
  document.addEventListener("visibilitychange", updateVisibility);
  window.addEventListener("unmarker:analytics-pageview", newPageView);
  updateVisibility();
  return () => {
    observer?.disconnect();
    clearInterval(timer);
    ledger.resetContinuity();
    document.removeEventListener("visibilitychange", updateVisibility);
    window.removeEventListener("unmarker:analytics-pageview", newPageView);
  };
}
