import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { capture, init } = vi.hoisted(() => ({
  capture: vi.fn(),
  init: vi.fn(),
}));
vi.mock("posthog-js", () => ({
  default: { capture, init, register: vi.fn() },
}));

beforeEach(() => {
  vi.resetModules();
  capture.mockClear();
  init.mockClear();
  vi.stubEnv("VITE_PUBLIC_POSTHOG_KEY", "test-key-never-sent");
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      location: { hostname: "www.unmarker.it" },
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sponsor analytics integration", () => {
  it("captures sponsor events once without a legacy action envelope", async () => {
    const { trackSponsorEvent } = await import("./analytics");
    trackSponsorEvent("sponsor_clicked", { sponsor_id: "example" });
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(1));
    expect(capture).toHaveBeenCalledWith(
      "sponsor_clicked",
      expect.objectContaining({
        sponsor_id: "example",
        component: "sponsors",
        sponsor_layout_version: "sponsors_v1",
        sponsor_tracking_version: 1,
        sponsor_count: 4,
      }),
    );
  });

  it("snapshots exposure when a workflow event occurs, before the SDK resolves", async () => {
    const { trackAction } = await import("./analytics");
    const { markSponsorSeen } = await import("./sponsorAnalyticsContext");
    trackAction("workflow_started", "workflow", { workflow_id: "flow-1" });
    markSponsorSeen();
    trackAction("workflow_completed", "workflow", { workflow_id: "flow-1" });
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(4));
    expect(capture).toHaveBeenCalledWith(
      "workflow_started",
      expect.objectContaining({
        workflow_id: "flow-1",
        sponsor_seen_before_event: false,
      }),
    );
    expect(capture).toHaveBeenCalledWith(
      "workflow_completed",
      expect.objectContaining({
        workflow_id: "flow-1",
        sponsor_seen_before_event: true,
      }),
    );
  });

  it("keeps the initial pageview exposure independent of lazy SDK timing", async () => {
    const { initAnalytics } = await import("./analytics");
    const { markSponsorSeen } = await import("./sponsorAnalyticsContext");
    const initialized = initAnalytics("en");
    markSponsorSeen();
    await initialized;
    expect(capture).toHaveBeenCalledWith(
      "$pageview",
      expect.objectContaining({
        sponsor_seen_before_event: false,
      }),
    );
  });

  it("does not initialize or send sponsor events from localhost", async () => {
    window.location.hostname = "localhost";
    const { trackSponsorEvent, initAnalytics } = await import("./analytics");
    trackSponsorEvent("sponsor_impression", { sponsor_id: "local" });
    await initAnalytics("en");
    expect(init).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });
});
