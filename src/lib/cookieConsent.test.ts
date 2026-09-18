import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONSENT_STORAGE_KEY,
  consentExpiry,
  createConsent,
  parseConsent,
} from "./consentPolicy";

let storage: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size;
    },
  });
  vi.stubGlobal("sessionStorage", globalThis.localStorage);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      location: { hostname: "www.unmarker.it" },
    }),
  );
  vi.stubGlobal("document", { cookie: "" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("cookie choices", () => {
  it("starts without consent and persists a dated, versioned rejection", async () => {
    const consent = await import("./cookieConsent");
    expect(consent.hasAnalyticsConsent()).toBe(false);
    const choice = consent.saveConsent(false);
    expect(JSON.parse(storage.get(CONSENT_STORAGE_KEY)!)).toEqual(choice);
    expect(choice.expiresAt).toBe(consentExpiry(choice.updatedAt));
    expect(consent.getConsent()?.analytics).toBe(false);
  });
  it("rejects malformed, old-version, future and expired consent", () => {
    const now = Date.now();
    expect(parseConsent({ ...createConsent(true), version: "old" })).toBeNull();
    expect(parseConsent(createConsent(true, now + 86400000))).toBeNull();
    expect(parseConsent(createConsent(true, now - 366 * 86400000))).toBeNull();
    expect(
      parseConsent({ ...createConsent(true), expiresAt: now + 86400000 }),
    ).toBeNull();
  });
  it("expires consent even while a tab stays open", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const consent = await import("./cookieConsent");
    const callback = vi.fn();
    consent.subscribeConsent(callback);
    const choice = consent.saveConsent(true);
    await vi.advanceTimersByTimeAsync(choice.expiresAt - choice.updatedAt);
    expect(consent.getConsent()).toBeNull();
    expect(callback).toHaveBeenCalledTimes(2);
  });
  it("synchronizes withdrawal and storage clearing from another tab", async () => {
    const consent = await import("./cookieConsent");
    consent.saveConsent(true);
    storage.set(CONSENT_STORAGE_KEY, JSON.stringify(createConsent(false)));
    window.dispatchEvent(
      Object.assign(new Event("storage"), { key: CONSENT_STORAGE_KEY }),
    );
    expect(consent.hasAnalyticsConsent()).toBe(false);
    storage.clear();
    window.dispatchEvent(Object.assign(new Event("storage"), { key: null }));
    expect(consent.getConsent()).toBeNull();
  });
  it("keeps a choice in memory when storage is blocked", async () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw Error("blocked");
      },
      setItem() {
        throw Error("blocked");
      },
    });
    const consent = await import("./cookieConsent");
    expect(consent.getConsent()).toBeNull();
    consent.saveConsent(false);
    expect(consent.getConsent()?.analytics).toBe(false);
  });
  it("clears only this project's analytics storage", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_KEY", "our-project");
    storage.set("ph_our-project_posthog", "visitor");
    storage.set("ph_other-project_posthog", "other");
    storage.set("unmarker.locale.preference", "en");
    storage.set(CONSENT_STORAGE_KEY, "choice");
    (await import("./cookieConsent")).clearAnalyticsStorage();
    expect(storage.has("ph_our-project_posthog")).toBe(false);
    expect([...storage.keys()]).toEqual([
      "ph_other-project_posthog",
      "unmarker.locale.preference",
      CONSENT_STORAGE_KEY,
    ]);
  });
  it("reports an offline server withdrawal and clears the warning after retry", async () => {
    const consent = await import("./cookieConsent");
    consent.saveConsent(false);
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    expect(await consent.syncSponsorConsent()).toBe(false);
    expect(consent.getConsentSyncFailed()).toBe(true);
    expect(await consent.syncSponsorConsent()).toBe(true);
    expect(consent.getConsentSyncFailed()).toBe(false);
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string).analytics,
    ).toBe(false);
  });
});
