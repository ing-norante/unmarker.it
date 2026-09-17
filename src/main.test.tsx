import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { hydrateRoot, createRoot, render, initAnalytics } = vi.hoisted(() => {
  const render = vi.fn();
  return {
    hydrateRoot: vi.fn(),
    createRoot: vi.fn(() => ({ render })),
    render,
    initAnalytics: vi.fn(() => new Promise<void>(() => {})),
  };
});

vi.mock("react-dom/client", () => ({ hydrateRoot, createRoot }));
vi.mock("./App", () => ({ default: () => null }));
vi.mock("@/lib/analytics", () => ({ initAnalytics }));
vi.mock("@/i18n/createI18n", () => ({
  initializeClientI18n: async () => ({ language: "en" }),
}));
vi.mock("@/i18n/documentMetadata", () => ({
  applyDocumentMetadataToDom: vi.fn(),
  createDocumentMetadata: vi.fn(),
}));

beforeEach(() => {
  vi.stubGlobal("window", {
    location: { pathname: "/" },
    sessionStorage: { removeItem: vi.fn() },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("app startup", () => {
  it("keeps the app available when analytics initialization fails", async () => {
    vi.stubGlobal("document", {
      getElementById: () => ({ hasChildNodes: () => true }),
    });
    const error = new Error("Analytics unavailable");
    initAnalytics.mockRejectedValueOnce(error);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await import("./main");

    await vi.waitFor(() => {
      expect(hydrateRoot).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        "Analytics initialization failed",
        error,
      );
    });
  });

  it.each([true, false])(
    "renders without waiting for analytics (prerendered: %s)",
    async (prerendered) => {
      const root = { hasChildNodes: () => prerendered };
      vi.stubGlobal("document", { getElementById: () => root });

      await import("./main");

      await vi.waitFor(() => expect(initAnalytics).toHaveBeenCalledWith("en"));
      if (prerendered) {
        expect(hydrateRoot).toHaveBeenCalledWith(root, expect.anything());
        expect(createRoot).not.toHaveBeenCalled();
      } else {
        expect(createRoot).toHaveBeenCalledWith(root);
        expect(render).toHaveBeenCalledOnce();
      }
    },
  );
});
