import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalC2paReader, LOCAL_C2PA_SETTINGS, type LocalReader, type LocalRuntime } from "./runtime";

const file = new File(["test"], "test.png", { type: "image/png" });
const validStore = { active_manifest: "test", validation_state: "Valid" as const, manifests: { test: {} } };
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
afterEach(() => vi.useRealTimers());

describe("local C2PA runtime", () => {
  it("disables remote manifests, OCSP, identity trust and online certificate trust", () => {
    expect(LOCAL_C2PA_SETTINGS).toEqual({
      verify: { verifyAfterReading: true, remoteManifestFetch: false, ocspFetch: false, verifyTrust: false, verifyTimestampTrust: false },
      cawgTrust: { verifyTrustList: false },
    });
  });

  it("reuses the worker runtime but releases every reader", async () => {
    const reader = { manifestStore: vi.fn().mockResolvedValue(validStore), free: vi.fn().mockResolvedValue(undefined) };
    const runtime = { open: vi.fn().mockResolvedValue(reader), dispose: vi.fn() };
    const load = vi.fn().mockResolvedValue(runtime);
    const service = createLocalC2paReader(load);
    await service.read(file, "present");
    await service.read(file, "present");
    expect(load).toHaveBeenCalledTimes(1);
    expect(reader.free).toHaveBeenCalledTimes(2);
    service.dispose();
    await tick();
    expect(runtime.dispose).toHaveBeenCalledTimes(1);
  });

  it("frees a reader whose manifest parsing fails and allows a later retry", async () => {
    const reader = { manifestStore: vi.fn().mockRejectedValue(new Error("broken")), free: vi.fn().mockResolvedValue(undefined) };
    const runtime = { open: vi.fn().mockResolvedValue(reader), dispose: vi.fn() };
    const load = vi.fn().mockResolvedValue(runtime);
    const service = createLocalC2paReader(load);
    expect(await service.read(file, "present")).toMatchObject({ verification: "incomplete", reasons: ["read-failed", "trust-not-evaluated"] });
    expect(reader.free).toHaveBeenCalledTimes(1);
    reader.manifestStore.mockResolvedValue(validStore);
    expect((await service.read(file, "present")).integrity).toBe("valid");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("terminates stalled reads on timeout rather than waiting for free on a dead worker", async () => {
    vi.useFakeTimers();
    const runtime = { open: vi.fn(() => new Promise<LocalReader>(() => undefined)), dispose: vi.fn() };
    const service = createLocalC2paReader(async () => runtime, 100);
    const pending = service.read(file, "present");
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toMatchObject({ verification: "incomplete", reasons: ["timeout", "trust-not-evaluated"] });
    expect(runtime.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes a late runtime after cancellation during initialization", async () => {
    let resolve!: (value: LocalRuntime) => void;
    const load = vi.fn(() => new Promise<LocalRuntime>((done) => { resolve = done; }));
    const runtime = { open: vi.fn(), dispose: vi.fn() };
    const service = createLocalC2paReader(load);
    const controller = new AbortController();
    const pending = service.read(file, "present", controller.signal);
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await tick();
    controller.abort();
    await assertion;
    resolve(runtime);
    await tick();
    expect(runtime.dispose).toHaveBeenCalledTimes(1);
    expect(runtime.open).not.toHaveBeenCalled();
  });

  it("keeps a missing local manifest incomplete when a C2PA reference was seen", async () => {
    const service = createLocalC2paReader(async () => ({ open: async () => null, dispose: vi.fn() }));
    expect(await service.read(file, "referenced")).toMatchObject({ presence: "referenced", verification: "incomplete", reasons: ["remote-disabled", "trust-not-evaluated"] });
  });

  it("recognizes the SDK's disabled remote-manifest error and reuses its healthy worker", async () => {
    const runtime = { open: vi.fn().mockRejectedValue(new Error('C2pa(RemoteManifestUrl("https://example.test/file.c2pa"))')), dispose: vi.fn() };
    const load = vi.fn().mockResolvedValue(runtime);
    const service = createLocalC2paReader(load);
    expect(await service.read(file, "referenced")).toMatchObject({ verification: "incomplete", reasons: ["remote-disabled", "trust-not-evaluated"] });
    expect(runtime.dispose).not.toHaveBeenCalled();
    runtime.open.mockResolvedValue({ manifestStore: async () => validStore, free: async () => undefined });
    expect((await service.read(file, "present")).integrity).toBe("valid");
    expect(load).toHaveBeenCalledTimes(1);
  });
});
