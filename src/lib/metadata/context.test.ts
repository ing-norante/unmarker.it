import { afterEach, describe, expect, it, vi } from "vitest";
import { deflateSync } from "node:zlib";
import { cleanImageMetadata, scanImageMetadata } from "../metadataCleaner";
import { createParseContext } from "./context";
import { inspectPngMetadata, PNG_SIGNATURE } from "./formats/png";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function chunk(type: string, data = new Uint8Array(0)) {
  const bytes = new Uint8Array(12 + data.length);
  new DataView(bytes.buffer).setUint32(0, data.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(data, 8);
  return bytes;
}

function fixture() {
  const compressed = deflateSync(new TextEncoder().encode("openai trainedAlgorithmicMedia"));
  const text = new Uint8Array(9 + compressed.length);
  text.set(new TextEncoder().encode("Comment\0"));
  text.set(compressed, 9);
  return new File([PNG_SIGNATURE, chunk("zTXt", text), chunk("IEND")], "test.png", { type: "image/png" });
}

describe("metadata operation contexts", () => {
  it.each([scanImageMetadata, cleanImageMetadata])("does not begin parsing when cancellation occurred during Blob reading", async (operation) => {
    const file = fixture();
    const buffer = await file.arrayBuffer();
    let resolve!: (buffer: ArrayBuffer) => void;
    vi.spyOn(file, "arrayBuffer").mockImplementation(() => new Promise((done) => { resolve = done; }));
    const stream = vi.spyOn(Blob.prototype, "stream");
    const controller = new AbortController();
    const result = operation(file, { signal: controller.signal });
    controller.abort();
    resolve(buffer);
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(stream).not.toHaveBeenCalled();
  });

  it.each([scanImageMetadata, cleanImageMetadata])("cancels an in-flight inflater and awaits cleanup before rejecting", async (operation) => {
    const file = fixture();
    let resolveRead!: (value: ReadableStreamReadResult<Uint8Array>) => void;
    let readStarted!: () => void;
    const started = new Promise<void>((resolve) => { readStarted = resolve; });
    let finishCancel!: () => void;
    const cancelFinished = new Promise<void>((resolve) => { finishCancel = resolve; });
    const reader = {
      read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) => { resolveRead = resolve; readStarted(); })),
      cancel: vi.fn(() => { resolveRead({ done: true, value: undefined }); return cancelFinished; }),
      releaseLock: vi.fn(),
    };
    vi.spyOn(Blob.prototype, "stream").mockReturnValue({ pipeThrough: () => ({ getReader: () => reader }) } as never);
    const controller = new AbortController();
    const operationResult = operation(file, { signal: controller.signal });
    let settled = false;
    const completion = operationResult.then(() => { settled = true; }, (error: unknown) => { settled = true; return error; });
    await started;
    controller.abort();
    await Promise.resolve();
    await Promise.resolve();
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    expect(reader.releaseLock).not.toHaveBeenCalled();
    finishCancel();
    expect(await completion).toMatchObject({ name: "AbortError" });
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  });

  it("reuses a complete format inspection without inflating or classifying again", async () => {
    const file = fixture();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const stream = vi.spyOn(Blob.prototype, "stream");
    const inspection = await inspectPngMetadata(bytes, "png", createParseContext());
    expect(inspection.scan.signals[0].markers).toEqual(expect.arrayContaining(["openai", "trainedAlgorithmicMedia"]));
    const clean = inspection.apply(file, createParseContext());
    expect(clean.removedCount).toBe(1);
    expect(stream).toHaveBeenCalledTimes(1);
    expect(new Uint8Array(await clean.blob.arrayBuffer())).toEqual(new Uint8Array([...PNG_SIGNATURE, ...chunk("IEND")]));
  });

  it("honors cancellation before applying an already prepared binary plan", async () => {
    const file = fixture();
    const inspection = await inspectPngMetadata(new Uint8Array(await file.arrayBuffer()), "png", createParseContext());
    const controller = new AbortController();
    controller.abort();
    expect(() => inspection.apply(file, createParseContext({ signal: controller.signal }))).toThrow();
  });

  it("stops container traversal when the entry budget is exhausted and preserves the file", async () => {
    const file = fixture();
    const scan = await scanImageMetadata(file, { budget: { entriesRemaining: 1 } });
    const clean = await cleanImageMetadata(file, { budget: { entriesRemaining: 1 } });
    expect(scan.warnings).toContainEqual({ code: "metadata-scan-limit" });
    expect(clean.warnings).toEqual(scan.warnings);
    expect(clean.blob).toBe(file);
    expect(clean.removedCount).toBe(0);
  });

  it("yields to a scheduled abort during a large unknown-file scan", async () => {
    const file = new File([new Uint8Array(16 * 1024 * 1024).fill(65)], "unknown.bin");
    const controller = new AbortController();
    const operation = scanImageMetadata(file, { signal: controller.signal });
    const result = expect(operation).rejects.toMatchObject({ name: "AbortError" });
    setTimeout(() => controller.abort(), 0);
    await result;
  });
});
