import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConfig } from "./config";

describe("Stripe backend key configuration", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_ID", "price_test");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/sponsor_test");
    vi.stubEnv("SPONSOR_DATABASE_URL", "");
    vi.stubEnv(
      "SPONSOR_SESSION_SECRET",
      "test-session-secret-longer-than-32-characters",
    );
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("SPONSOR_APP_URL", "https://www.unmarker.it");
    vi.stubEnv("SPONSOR_ALLOW_LIVE_PAYMENTS", "false");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["sk_test_mock", "rk_test_mock"])(
    "accepts sandbox backend key %s",
    (key) => {
      vi.stubEnv("STRIPE_PRIVATE_KEY", key);
      expect(getConfig().live).toBe(false);
    },
  );

  it.each(["sk_live_mock", "rk_live_mock"])(
    "requires explicit live opt-in for %s",
    (key) => {
      vi.stubEnv("STRIPE_PRIVATE_KEY", key);
      expect(getConfig).toThrow("unavailable");
      vi.stubEnv("SPONSOR_ALLOW_LIVE_PAYMENTS", "true");
      expect(getConfig().live).toBe(true);
      vi.stubEnv("SPONSOR_APP_URL", "http://localhost:5173");
      expect(getConfig).toThrow("unavailable");
    },
  );

  it.each(["pk_live_mock", "pk_test_mock", "unknown_mock"])(
    "rejects non-backend key %s",
    (key) => {
      vi.stubEnv("STRIPE_PRIVATE_KEY", key);
      vi.stubEnv("SPONSOR_ALLOW_LIVE_PAYMENTS", "true");
      expect(getConfig).toThrow("unavailable");
    },
  );
});
