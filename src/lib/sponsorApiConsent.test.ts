import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConsent, type ConsentReceipt } from "./consentPolicy";
const state = vi.hoisted(() => ({
  choice: null as ConsentReceipt | null,
  identity: vi.fn(),
}));
vi.mock("./cookieConsent", () => ({ getConsent: () => state.choice }));
vi.mock("./analytics", () => ({ getSponsorAnalyticsId: state.identity }));
beforeEach(() => {
  vi.resetModules();
  state.choice = null;
  state.identity.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
  );
});
afterEach(() => vi.unstubAllGlobals());
describe("checkout consent at dispatch", () => {
  it("removes existing attribution and sends an explicit refusal if consent is missing", async () => {
    const data = new FormData();
    data.set("analyticsId", "old-visitor");
    await (await import("./sponsorApi")).createSponsorCheckout(data);
    expect(data.has("analyticsId")).toBe(false);
    expect(JSON.parse(String(data.get("analyticsConsent"))).analytics).toBe(
      false,
    );
    expect(state.identity).not.toHaveBeenCalled();
  });
  it("cannot attach an old identity to a new consent period", async () => {
    state.choice = createConsent(true, Date.now() - 1000);
    state.identity.mockImplementation(async () => {
      state.choice = createConsent(true);
      return "old-period-identity";
    });
    const data = new FormData();
    await (await import("./sponsorApi")).createSponsorCheckout(data);
    expect(data.has("analyticsId")).toBe(false);
    expect(JSON.parse(String(data.get("analyticsConsent")))).toEqual(
      state.choice,
    );
  });
});
