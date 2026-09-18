import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureResult, PostHogConfig } from "posthog-js";
const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  shutdown: vi.fn().mockResolvedValue(undefined),
  capture: vi.fn(),
  register: vi.fn(),
  captureException: vi.fn(),
  opt_out_capturing: vi.fn(),
  opt_in_capturing: vi.fn(),
  stopSessionRecording: vi.fn(),
  reset: vi.fn(),
  has_opted_out_capturing: vi.fn(() => false),
  get_distinct_id: vi.fn(() => "consenting-visitor"),
}));
vi.mock("posthog-js", () => ({ default: sdk }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  sdk.init.mockReturnValue(sdk);
  const storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  });
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      location: { hostname: "www.unmarker.it", pathname: "/" },
    }),
  );
  vi.stubGlobal("document", { cookie: "" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  vi.stubEnv("VITE_PUBLIC_POSTHOG_KEY", "test-key");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("analytics consent gate", () => {
  it("never initializes or captures anything before a choice or after rejection", async () => {
    const api = await import("./analytics");
    await api.initAnalytics("en");
    api.trackAction("workflow_started", "workflow");
    api.trackSponsorEvent("sponsor_clicked", { sponsor_id: "example" });
    await api.captureException(new Error("private"));
    expect(await api.getSponsorAnalyticsId()).toBeNull();
    (await import("./cookieConsent")).saveConsent(false);
    await api.capturePageview();
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });
  it("does not replay pre-consent events on acceptance and stops on withdrawal", async () => {
    const api = await import("./analytics");
    const consent = await import("./cookieConsent");
    await api.initAnalytics("en");
    api.trackAction("workflow_started", "workflow", { workflow_id: "before" });
    consent.saveConsent(true);
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalledTimes(1));
    await api.capturePageview();
    expect(
      sdk.capture.mock.calls.some(([name]) => name === "workflow_started"),
    ).toBe(false);
    expect(await api.getSponsorAnalyticsId()).toBe("consenting-visitor");
    consent.saveConsent(false);
    sdk.capture.mockClear();
    api.trackAction("workflow_completed", "workflow");
    await api.capturePageview();
    expect(sdk.opt_out_capturing).toHaveBeenCalled();
    expect(sdk.reset).toHaveBeenCalledWith(true);
    expect(sdk.capture).not.toHaveBeenCalled();
    const config = sdk.init.mock.calls[0][1] as PostHogConfig;
    expect(config.disable_session_recording).toBe(true);
    expect(config.autocapture).toBe(false);
    expect(config.request_batching).toBe(false);
    expect(config.disable_beacon).toBe(true);
    expect((config.fetch_options as RequestInit).signal?.aborted).toBe(true);
    const beforeSend = config.before_send as (
      e: CaptureResult,
    ) => CaptureResult | null;
    expect(
      beforeSend({ event: "$exception", properties: {} } as CaptureResult),
    ).toBeNull();
  });
  it("removes checkout references from page, session and nested initial URLs", async () => {
    (await import("./cookieConsent")).saveConsent(true);
    await (await import("./analytics")).initAnalytics("en");
    const config = sdk.init.mock.calls[0][1] as PostHogConfig;
    const beforeSend = config.before_send as (
      e: CaptureResult,
    ) => CaptureResult;
    const result = beforeSend({
      uuid: "00000000-0000-4000-8000-000000000001",
      event: "$pageview",
      properties: {
        $current_url:
          "https://www.unmarker.it/?sponsor_purchase=private#secret",
        $session_entry_url: "https://www.unmarker.it/?sponsor_purchase=private",
        $set_once: {
          $initial_current_url: "https://www.unmarker.it/?email=private",
        },
      },
    } as CaptureResult);
    expect(result.properties.$current_url).toBe("https://www.unmarker.it/");
    expect(result.properties.$session_entry_url).toBe(
      "https://www.unmarker.it/",
    );
    expect(result.properties.$set_once.$initial_current_url).toBe(
      "https://www.unmarker.it/",
    );
  });
  it("keeps old retry requests aborted after a new consent period", async () => {
    const api = await import("./analytics");
    const consent = await import("./cookieConsent");
    await api.initAnalytics("en");
    consent.saveConsent(true);
    await api.capturePageview();
    const oldConfig = sdk.init.mock.calls[0][1] as PostHogConfig;
    consent.saveConsent(false);
    consent.saveConsent(true);
    await api.capturePageview();
    const newConfig = sdk.init.mock.calls[1][1] as PostHogConfig;
    expect((oldConfig.fetch_options as RequestInit).signal?.aborted).toBe(true);
    expect((newConfig.fetch_options as RequestInit).signal?.aborted).toBe(
      false,
    );
    expect(sdk.init.mock.calls[0][2]).not.toBe(sdk.init.mock.calls[1][2]);
    expect(sdk.shutdown).toHaveBeenCalledOnce();
  });
  it("does not initialize when consent is revoked while the lazy import is pending", async () => {
    const api = await import("./analytics");
    const consent = await import("./cookieConsent");
    await api.initAnalytics("en");
    consent.saveConsent(true);
    consent.saveConsent(false);
    await Promise.resolve();
    await Promise.resolve();
    await api.capturePageview();
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
  });
  it("can accept again after withdrawing during a pending import", async () => {
    const api = await import("./analytics");
    const consent = await import("./cookieConsent");
    await api.initAnalytics("en");
    consent.saveConsent(true);
    consent.saveConsent(false);
    consent.saveConsent(true);
    await vi.waitFor(() =>
      expect(sdk.capture).toHaveBeenCalledWith("$pageview", expect.any(Object)),
    );
    expect(sdk.init).toHaveBeenCalledTimes(1);
  });
});

describe("sponsorship navigation", () => {
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false };

  it("captures each placement immediately before navigation and preserves legacy insights", async () => {
    const api = await import("./analytics");
    (await import("./cookieConsent")).saveConsent(true);
    await api.initAnalytics("en");
    sdk.capture.mockClear();
    for (const location of [
      "desktop_left_card",
      "desktop_right_card",
      "desktop_controls",
      "mobile_controls",
      "language_switcher",
    ] as const) {
      api.trackSponsorshipLink(location, "zh-Hans", click, 17);
      // No await: leaving the document must not defer a ready SDK capture.
      expect(sdk.capture).toHaveBeenCalledWith(
        "sponsorship_link_clicked",
        expect.objectContaining({
          link_location: location,
          source_path: "/",
          destination_path: "/zh-hans/sponsorship",
          destination_locale: "zh-Hans",
          available_spots: 17,
          activation: "click",
        }),
      );
    }
    expect(
      sdk.capture.mock.calls.filter(
        ([event]) => event === "sponsorship_link_clicked",
      ),
    ).toHaveLength(5);
    expect(
      sdk.capture.mock.calls.filter(
        ([event]) => event === "sponsor_advertise_opened",
      ),
    ).toHaveLength(4);
    sdk.capture.mockClear();
    api.trackSponsorshipLink("mobile_controls", "en", { ...click, button: 1 });
    api.trackSponsorshipLink("mobile_controls", "en", {
      ...click,
      ctrlKey: true,
    });
    api.trackSponsorshipLink("mobile_controls", "en", { ...click, button: 2 });
    expect(
      sdk.capture.mock.calls
        .filter(([event]) => event === "sponsorship_link_clicked")
        .map(([, props]) => props.activation),
    ).toEqual(["middle_click", "modified_click"]);
  });

  it("never captures rejected clicks or replays pre-consent clicks", async () => {
    const api = await import("./analytics");
    const consent = await import("./cookieConsent");
    await api.initAnalytics("en");
    api.trackSponsorshipLink("mobile_controls", "en", click);
    consent.saveConsent(true);
    await api.capturePageview();
    expect(
      sdk.capture.mock.calls.some(
        ([event]) => event === "sponsorship_link_clicked",
      ),
    ).toBe(false);
    consent.saveConsent(false);
    sdk.capture.mockClear();
    api.trackSponsorshipLink("mobile_controls", "en", click);
    await api.capturePageview();
    expect(sdk.capture).not.toHaveBeenCalled();
  });

  it("counts a loaded page once, supports late consent and distinguishes language navigation", async () => {
    window.location.pathname = "/sponsorship";
    const api = await import("./analytics");
    const consent = await import("./cookieConsent");
    await api.initAnalytics("en");
    expect(sdk.capture).not.toHaveBeenCalled();
    consent.saveConsent(true);
    await api.capturePageview();
    await api.capturePageview();
    await api.initAnalytics("en");
    const views = () =>
      sdk.capture.mock.calls.filter(
        ([event]) => event === "sponsorship_page_viewed",
      );
    expect(views()).toHaveLength(1);
    expect(views()[0][1]).toMatchObject({
      page_path: "/sponsorship",
      locale: "en",
    });
    window.location.pathname = "/zh-hans/sponsorship";
    await api.registerAnalyticsLocale("zh-Hans");
    await api.capturePageview();
    expect(views()).toHaveLength(2);
    expect(views()[1][1]).toMatchObject({
      page_path: "/zh-hans/sponsorship",
      locale: "zh-Hans",
    });
    consent.saveConsent(false);
    sdk.capture.mockClear();
    await api.capturePageview();
    expect(sdk.capture).not.toHaveBeenCalled();
  });
});
