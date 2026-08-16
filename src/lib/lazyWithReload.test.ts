import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadChunk } from "./lazyWithReload";

const reload = vi.fn();
const store = new Map<string, string>();

describe("loadChunk", () => {
  beforeEach(() => {
    reload.mockClear();
    store.clear();
    vi.stubGlobal("window", {
      location: { reload },
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the module on the first success without reloading", async () => {
    const module = { default: () => null };
    const loader = vi.fn().mockResolvedValue(module);

    await expect(loadChunk("chunk", loader)).resolves.toBe(module);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it("retries once and returns the module without reloading", async () => {
    const module = { default: () => null };
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("chunk missing"))
      .mockResolvedValueOnce(module);

    await expect(loadChunk("chunk", loader)).resolves.toBe(module);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads once after two failures", async () => {
    const loader = vi.fn().mockRejectedValue(new Error("chunk missing"));

    await expect(loadChunk("chunk", loader)).rejects.toThrow("chunk missing");
    expect(loader).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload a second time for the same chunk", async () => {
    const loader = vi.fn().mockRejectedValue(new Error("chunk missing"));

    await expect(loadChunk("chunk", loader)).rejects.toThrow();
    await expect(loadChunk("chunk", loader)).rejects.toThrow();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
