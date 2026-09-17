import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSponsorVisible,
  observeSponsors,
  trackSponsorClick,
} from "@/lib/sponsorTracking";

const { capture, consent } = vi.hoisted(() => ({
  capture: vi.fn(),
  consent: { enabled: true },
}));
vi.mock("@/lib/cookieConsent", () => ({
  hasAnalyticsConsent: () => consent.enabled,
}));
vi.mock("@/lib/analytics", () => ({ trackSponsorEvent: capture }));

const sponsor = {
  id: "house-project",
  name: "House",
  claim: "Example",
  url: "https://example.com",
  icon: "✦",
  kind: "house" as const,
};
const placement = {
  location: "mobile_top" as const,
  position: 1,
  face: "chip" as const,
};
function rect(left = 0, right = 100, top = 0, bottom = 100) {
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function makeElement(bounds = rect()) {
  const element = {
    isConnected: true,
    offsetWidth: 100,
    offsetHeight: 100,
    parentElement: null as unknown,
    dataset: {
      sponsorKey: JSON.stringify([sponsor.id, placement.location, 1, "chip"]),
      sponsorId: sponsor.id,
      sponsorKind: "house",
      sponsorLocation: "mobile_top",
      sponsorPosition: "1",
      sponsorFace: "chip",
    },
    getClientRects: () => [bounds],
    getBoundingClientRect: () => bounds,
    contains: (target: unknown) => target === element,
  };
  return element as unknown as HTMLElement;
}

let page: EventTarget & {
  visibilityState: string;
  elementFromPoint: ReturnType<typeof vi.fn>;
};
let browser: EventTarget & { innerWidth: number; innerHeight: number };
let styles: Map<unknown, object>;

beforeEach(() => {
  capture.mockReset();
  consent.enabled = true;
  page = Object.assign(new EventTarget(), {
    visibilityState: "visible",
    elementFromPoint: vi.fn(),
  });
  browser = Object.assign(new EventTarget(), {
    innerWidth: 1000,
    innerHeight: 800,
  });
  styles = new Map();
  vi.stubGlobal("document", page);
  vi.stubGlobal("window", browser);
  vi.stubGlobal("IntersectionObserver", undefined);
  vi.stubGlobal("getComputedStyle", (element: unknown) => ({
    visibility: "visible",
    opacity: "1",
    overflowX: "visible",
    overflowY: "visible",
    ...styles.get(element),
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("actual sponsor visibility", () => {
  it("requires at least half of the card inside the viewport", () => {
    const belowHalf = makeElement(rect(-51, 49));
    page.elementFromPoint.mockReturnValue(belowHalf);
    expect(isSponsorVisible(belowHalf)).toBe(false);
    const half = makeElement(rect(-50, 50));
    page.elementFromPoint.mockReturnValue(half);
    expect(isSponsorVisible(half)).toBe(true);
  });
  it("excludes hidden flip faces, edge-on rotations, background tabs and overlays", () => {
    const element = makeElement();
    page.elementFromPoint.mockReturnValue(element);
    styles.set(element, { visibility: "hidden" });
    expect(isSponsorVisible(element)).toBe(false);
    styles.clear();
    page.visibilityState = "hidden";
    expect(isSponsorVisible(element)).toBe(false);
    page.visibilityState = "visible";
    page.elementFromPoint.mockReturnValue({ overlay: true });
    expect(isSponsorVisible(element)).toBe(false);
    const rotated = makeElement(rect(0, 10));
    page.elementFromPoint.mockReturnValue(rotated);
    expect(isSponsorVisible(rotated)).toBe(false);
  });
  it("respects the mobile bar clipping and transparent ancestors", () => {
    const element = makeElement();
    const parent = makeElement(rect(0, 40));
    Object.assign(element, { parentElement: parent });
    styles.set(parent, { overflowX: "hidden" });
    page.elementFromPoint.mockReturnValue(element);
    expect(isSponsorVisible(element)).toBe(false);
    styles.set(parent, { opacity: "0" });
    expect(isSponsorVisible(element)).toBe(false);
  });
});

describe("shared sponsor observer", () => {
  it("counts only exposure after consent and stops again on withdrawal", () => {
    vi.useFakeTimers();
    consent.enabled = false;
    const element = makeElement();
    page.elementFromPoint.mockReturnValue(element);
    const stop = observeSponsors({
      querySelectorAll: () => [element],
    } as unknown as HTMLElement);
    vi.advanceTimersByTime(2000);
    trackSponsorClick(sponsor, placement);
    expect(capture).not.toHaveBeenCalled();
    consent.enabled = true;
    browser.dispatchEvent(new Event("unmarker:analytics-pageview"));
    vi.advanceTimersByTime(500);
    expect(capture).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(capture).toHaveBeenCalledOnce();
    consent.enabled = false;
    browser.dispatchEvent(new Event("unmarker:analytics-pageview"));
    trackSponsorClick(sponsor, placement);
    vi.advanceTimersByTime(2000);
    expect(capture).toHaveBeenCalledOnce();
    stop();
  });
  it("deduplicates rendered copies, resets per page view, and cleans up timers", () => {
    vi.useFakeTimers();
    const first = makeElement();
    const duplicate = makeElement();
    page.elementFromPoint.mockReturnValue(first);
    const root = {
      querySelectorAll: () => [first, duplicate],
    } as unknown as HTMLElement;
    const stop = observeSponsors(root);
    browser.dispatchEvent(new Event("unmarker:analytics-pageview"));
    vi.advanceTimersByTime(1200);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][0]).toBe("sponsor_impression");
    expect(capture.mock.calls[0][1]).toMatchObject({
      sponsor_id: sponsor.id,
      sponsor_kind: "house",
      sponsor_position: 1,
      sponsor_location: "mobile_top",
    });
    trackSponsorClick(sponsor, placement);
    expect(capture.mock.calls[1][1]).toMatchObject({
      has_viewable_impression: true,
      first_click_for_impression: true,
      sponsor_impression_id: capture.mock.calls[0][1].sponsor_impression_id,
    });
    browser.dispatchEvent(new Event("unmarker:analytics-pageview"));
    vi.advanceTimersByTime(1200);
    expect(capture).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(2000);
    expect(capture).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
});
