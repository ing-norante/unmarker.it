import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { capture, init } = vi.hoisted(() => ({
  capture: vi.fn(),
  init: vi.fn(),
}));
vi.mock("posthog-js", () => {
  const sdk = {
    capture,
    init,
    register: vi.fn(),
    has_opted_out_capturing: () => false,
    opt_out_capturing: vi.fn(),
    opt_in_capturing: vi.fn(),
    stopSessionRecording: vi.fn(),
    reset: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
  init.mockReturnValue(sdk);
  return { default: sdk };
});

beforeEach(async () => {
  vi.resetModules();
  capture.mockClear();
  init.mockClear();
  vi.stubEnv("VITE_PUBLIC_POSTHOG_KEY", "test-key-never-sent");
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      location: { hostname: "www.unmarker.it" },
    }),
  );
  (await import("./cookieConsent")).saveConsent(true);
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
        sponsor_count: 3,
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
