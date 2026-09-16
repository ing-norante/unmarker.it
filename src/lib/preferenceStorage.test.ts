import { afterEach, describe, expect, it, vi } from "vitest";
import { readPreference, writePreference } from "./preferenceStorage";

afterEach(() => vi.unstubAllGlobals());

describe("optional preference storage", () => {
  it("reads and persists preferences when storage is available", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    writePreference("locale", "zh-Hans");
    expect(readPreference("locale")).toBe("zh-Hans");
  });

  it("tolerates blocked reads and quota-exhausted writes", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new DOMException("Blocked", "SecurityError"); },
      setItem: () => { throw new DOMException("Full", "QuotaExceededError"); },
    });
    expect(readPreference("locale")).toBeNull();
    expect(() => writePreference("locale", "zh-Hans")).not.toThrow();
  });

  it("works when the storage API is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readPreference("locale")).toBeNull();
    expect(() => writePreference("locale", "en")).not.toThrow();
  });
});
