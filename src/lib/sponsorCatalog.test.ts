import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSponsorCatalog } from "./sponsorCatalog";

const catalog = {
  sponsors: [],
  availableSpots: 17,
  checkoutEnabled: true,
  testMode: true,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const signal = () => new AbortController().signal;
describe("sponsor catalog loading", () => {
  it("keeps real zero capacity distinct from a missing response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ...catalog, availableSpots: 0 })),
        ),
    );
    expect((await fetchSponsorCatalog(signal())).availableSpots).toBe(0);
  });
  it.each([
    { ...catalog, availableSpots: undefined },
    { ...catalog, availableSpots: 21 },
    { ...catalog, availableSpots: -1 },
    { ...catalog, availableSpots: 2.5 },
    { ...catalog, checkoutEnabled: "true" },
    { ...catalog, sponsors: [{}] },
  ])("rejects incomplete or invalid catalog data (%j)", async (data) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(data))),
    );
    await expect(fetchSponsorCatalog(signal())).rejects.toThrow();
  });
  it.each([429, 500, 503])("rejects HTTP %s", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("unavailable", { status })),
    );
    await expect(fetchSponsorCatalog(signal())).rejects.toThrow(
      "catalog_unavailable",
    );
  });
  it("can retry after malformed JSON or a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("not json"))
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce(new Response(JSON.stringify(catalog))),
    );
    await expect(fetchSponsorCatalog(signal())).rejects.toThrow();
    await expect(fetchSponsorCatalog(signal())).rejects.toThrow();
    await expect(fetchSponsorCatalog(signal())).resolves.toEqual(catalog);
  });
  it.each(["timeout", "unmount"])(
    "aborts a stalled request on %s and clears its timer",
    async (cause) => {
      vi.useFakeTimers();
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url, options) =>
            new Promise((_resolve, reject) => {
              options.signal.addEventListener(
                "abort",
                () => reject(new DOMException("Aborted", "AbortError")),
                { once: true },
              );
            }),
        ),
      );
      const controller = new AbortController();
      const request = expect(
        fetchSponsorCatalog(controller.signal),
      ).rejects.toMatchObject({ name: "AbortError" });
      if (cause === "timeout") await vi.advanceTimersByTimeAsync(10_000);
      else controller.abort();
      await request;
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
