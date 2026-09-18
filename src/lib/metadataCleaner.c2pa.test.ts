import { beforeEach, describe, expect, it, vi } from "vitest";
import { scanImageMetadata } from "./metadataCleaner";
import { readLocalC2pa } from "./c2pa/runtime";
import { interpretManifestStore } from "./c2pa/interpret";

vi.mock("./c2pa/runtime", () => ({ readLocalC2pa: vi.fn() }));
beforeEach(() => vi.mocked(readLocalC2pa).mockReset());

function png(withCredentials: boolean) {
  const parts: BlobPart[] = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  for (const type of withCredentials ? ["caBX", "IEND"] : ["IEND"]) {
    const chunk = new Uint8Array(12);
    chunk.set(new TextEncoder().encode(type), 4);
    parts.push(chunk);
  }
  return new File(parts, "test.png", { type: "image/png" });
}

describe("C2PA metadata integration", () => {
  it("never initializes the SDK for an image without provenance candidates", async () => {
    expect((await scanImageMetadata(png(false))).c2pa).toBeUndefined();
    expect(readLocalC2pa).not.toHaveBeenCalled();
  });

  it("treats a C2PA camera photograph as provenance without AI metadata", async () => {
    vi.mocked(readLocalC2pa).mockResolvedValue({ presence: "present", origin: "photograph", aiDisclosure: false, integrity: "valid", trust: "unknown", verification: "local", reasons: ["trust-not-evaluated"] });
    const file = png(true);
    const controller = new AbortController();
    const result = await scanImageMetadata(file, { signal: controller.signal });
    expect(result.hasAiMetadata).toBe(false);
    expect(result.c2pa?.origin).toBe("photograph");
    expect(readLocalC2pa).toHaveBeenCalledWith(file, "present", controller.signal);
  });

  it("does not scan or initialize resources for already-cancelled work", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(scanImageMetadata(png(true), { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(readLocalC2pa).not.toHaveBeenCalled();
  });

  it.each(["compositeCapture", "compositeSynthetic"])("does not mark a %s credential as AI metadata", async (source) => {
    vi.mocked(readLocalC2pa).mockResolvedValue(interpretManifestStore({
      active_manifest: "current", validation_state: "Valid",
      manifests: { current: { assertions: [{ label: "c2pa.actions.v2", data: {
        actions: [{ action: "c2pa.created", digitalSourceType: `http://cv.iptc.org/newscodes/digitalsourcetype/${source}` }],
      } }] } },
    }));
    const result = await scanImageMetadata(png(true));
    expect(result.hasAiMetadata).toBe(false);
    expect(result.c2pa).toMatchObject({ origin: "composite", aiDisclosure: false });
  });
});
