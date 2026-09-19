import { describe, expect, it, vi } from "vitest";
import { containsMetadataText, findTextMarkers, findTextMarkersAsync, TEXT_SCAN_BLOCK_BYTES } from "./textScanner";
import { createParseContext } from "./context";

const utf8 = (text: string) => new TextEncoder().encode(text);
const encodings = ["utf-8", "latin1", "utf-16le", "utf-16be"] as const;
type Encoding = (typeof encodings)[number];

describe("asynchronous text scanning", () => {
  it.each(encodings)("shares evidence matching with the synchronous adapter in %s", async (encoding) => {
    const bytes = encode(`${" ".repeat(TEXT_SCAN_BLOCK_BYTES - 4)}openai negative---prompt sd:model`, encoding);
    const candidates = ["openai", "negative_prompt"];
    expect(await findTextMarkersAsync(bytes, candidates, createParseContext()))
      .toEqual(findTextMarkers(bytes, candidates));
  });

  it("lets a browser task cancel a scan after decoding has begun", async () => {
    const controller = new AbortController();
    const context = createParseContext({ signal: controller.signal });
    const checkpoint = vi.fn(context.checkpoint);
    const task = findTextMarkersAsync(new Uint8Array(16 * 1024 * 1024).fill(65), ["openai"], { ...context, checkpoint });
    expect(checkpoint).toHaveBeenCalled();
    const rejected = expect(task).rejects.toMatchObject({ name: "AbortError" });
    setTimeout(() => controller.abort(), 0);
    await rejected;
  });
});

describe("findTextMarkers", () => {
  it.each(encodings)("preserves literal and normalized aliases in %s", (encoding) => {
    const bytes = encode("\u00e9 OPENAI; stable diffusion; Negative---Prompt; sd:Model_12:foo-bar", encoding);
    expect(findTextMarkers(bytes, ["negative_prompt", "stable_diffusion", "stable diffusion", "openai"]))
      .toEqual(["negative_prompt", "stable_diffusion", "stable diffusion", "openai", "sd:model_12:foo-bar"]);
  });

  it.each(encodings)("matches every possible marker split across multiple blocks in %s", (encoding) => {
    const marker = "COMPOSITEWITHTRAINEDALGORITHMICMEDIA";
    const bytesPerCharacter = encoding.startsWith("utf-16") ? 2 : 1;
    for (const block of [1, 2, 3]) {
      for (let split = 0; split <= marker.length; split += 1) {
        const padding = " ".repeat((TEXT_SCAN_BLOCK_BYTES * block) / bytesPerCharacter - split);
        const bytes = encode(padding + marker + "!", encoding);
        expect(findTextMarkers(bytes, ["compositeWithTrainedAlgorithmicMedia"]), `${encoding}, block ${block}, split ${split}`)
          .toEqual(["compositeWithTrainedAlgorithmicMedia"]);
      }
    }
  });

  it("retains normalized and literal context across arbitrary separators and NULL-only blocks", () => {
    const bytes = utf8(
      "negative" + ".".repeat(TEXT_SCAN_BLOCK_BYTES * 3) + "prompt; pro" +
      "\0".repeat(TEXT_SCAN_BLOCK_BYTES * 3) + "mpt; stable" + "_".repeat(TEXT_SCAN_BLOCK_BYTES * 2) + "diffusion",
    );
    expect(findTextMarkers(bytes, ["prompt", "negative_prompt", "stable diffusion", "absent"]))
      .toEqual(["prompt", "negative_prompt", "stable diffusion"]);
  });

  it("preserves decoding and normalization across split UTF-8 characters", () => {
    const bytes = utf8(" ".repeat(TEXT_SCAN_BLOCK_BYTES - 4) + "foo\u{1f642}bar");
    expect(findTextMarkers(bytes, ["foo bar"])).toEqual(["foo bar"]);
  });

  it.each(["utf-16le", "utf-16be"] as const)("preserves split surrogate pairs in %s", (encoding) => {
    const bytes = encode(" ".repeat(TEXT_SCAN_BLOCK_BYTES / 2 - 4) + "foo\u{1f642}bar", encoding);
    expect(findTextMarkers(bytes, ["foo bar"])).toEqual(["foo bar"]);
  });

  it("keeps aliases and results deterministic despite input order and duplicates", () => {
    expect(findTextMarkers(utf8("negative prompt OPENAI Prompt sd:first sd:later"), [
      "prompt", "OPENAI", "openai", "prompt", "negative_prompt",
    ])).toEqual(["prompt", "OPENAI", "openai", "negative_prompt", "sd:first"]);
  });

  it("does not join the end of one decoded encoding to the start of another", () => {
    expect(findTextMarkers(utf8("foo...bar"), ["bar foo"])).toEqual([]);
  });

  it("handles empty inputs and candidates", () => {
    expect(findTextMarkers(new Uint8Array(), ["openai"])).toEqual([]);
    expect(findTextMarkers(new Uint8Array(), [""])).toEqual([""]);
    expect(findTextMarkers(utf8(" sd:model"), [])).toEqual(["sd:model"]);
    expect(findTextMarkers(utf8(" sd:model"), ["sd:model"])).toEqual(["sd:model"]);
  });

  it("propagates cancellation between decoder blocks", () => {
    const cancelled = new Error("cancelled");
    const checkpoint = vi.fn(() => {
      if (checkpoint.mock.calls.length === 3) throw cancelled;
    });
    expect(() => findTextMarkers(new Uint8Array(TEXT_SCAN_BLOCK_BYTES * 4), ["prompt"], checkpoint))
      .toThrow(cancelled);
    expect(checkpoint).toHaveBeenCalledTimes(3);
  });

  it("bounds decoder input/output for a large unknown file and visits every encoding", () => {
    const decoder = TextDecoder.prototype.decode;
    const labels = new Set<string>();
    let largestInput = 0;
    let largestOutput = 0;
    let calls = 0;
    const decodeSpy = vi.spyOn(TextDecoder.prototype, "decode").mockImplementation(function (
      this: TextDecoder,
      input?: Parameters<TextDecoder["decode"]>[0],
      options?: Parameters<TextDecoder["decode"]>[1],
    ) {
      calls += 1;
      labels.add(this.encoding);
      largestInput = Math.max(largestInput, input?.byteLength ?? 0);
      const result = decoder.call(this, input, options);
      largestOutput = Math.max(largestOutput, result.length);
      return result;
    });
    try {
      const bytes = new Uint8Array(TEXT_SCAN_BLOCK_BYTES * 64 + 3).fill(0x86);
      expect(findTextMarkers(bytes, ["prompt", "c2pa"])).toEqual([]);
      expect(largestInput).toBeLessThanOrEqual(TEXT_SCAN_BLOCK_BYTES);
      expect(largestOutput).toBeLessThanOrEqual(TEXT_SCAN_BLOCK_BYTES);
      expect(calls).toBe(4 * 66);
      expect(labels).toEqual(new Set(["utf-8", "windows-1252", "utf-16le", "utf-16be"]));
    } finally {
      decodeSpy.mockRestore();
    }
  });
});

describe("sd: token boundaries", () => {
  it("matches every split of a token across a block boundary", () => {
    const token = "sd:model_name:checkpoint-123";
    for (let split = 0; split <= token.length; split += 1) {
      const bytes = utf8(" ".repeat(TEXT_SCAN_BLOCK_BYTES - split) + token + " sd:second");
      expect(findTextMarkers(bytes, []), `split ${split}`).toEqual([token]);
    }
  });

  it("requires a word boundary and at least one token character", () => {
    expect(findTextMarkers(utf8("asd:no _sd:no 1sd:no sd: sd:? sd:/; sd:yes"), [])).toEqual(["sd:yes"]);
    expect(findTextMarkers(utf8("sd:"), [])).toEqual([]);
    expect(findTextMarkers(utf8(" sd:\0\0"), [])).toEqual([]);
  });

  it("does not treat a carried suffix as a new word boundary", () => {
    const bytes = utf8("a".repeat(TEXT_SCAN_BLOCK_BYTES - 4) + "sd:x" + "-sd:actual ");
    expect(findTextMarkers(bytes, [])).toEqual(["sd:actual"]);
  });

  it("skips invalid carried tokens without losing later matches", () => {
    const bytes = utf8("a".repeat(TEXT_SCAN_BLOCK_BYTES - 4) + "sd:x" + " sd:actual ");
    expect(findTextMarkers(bytes, [])).toEqual(["sd:actual"]);
  });

  it("bounds a token spanning many blocks and ignores later tokens", () => {
    const bytes = utf8("sd:" + "a".repeat(TEXT_SCAN_BLOCK_BYTES * 3) + " sd:second");
    expect(findTextMarkers(bytes, [])).toEqual(["sd:" + "a".repeat(253)]);
  });

  it("retains pending tokens across NULL-only blocks until their real terminator", () => {
    const bytes = utf8("sd:part" + "\0".repeat(TEXT_SCAN_BLOCK_BYTES * 2) + "two! sd:later");
    expect(findTextMarkers(bytes, [])).toEqual(["sd:parttwo"]);
  });
});

describe("containsMetadataText", () => {
  it.each(encodings)("checks literal text in %s without normalized false positives", (encoding) => {
    expect(containsMetadataText(encode("<XMPMETA><rdf:foo TIFF:ORIENTATION='1'/></XMPMETA>", encoding), ["tiff:orientation"])).toBe(true);
    expect(containsMetadataText(encode("<xmpmeta>", encoding), ["rdf:", "XMPMETA"])).toBe(true);
    expect(containsMetadataText(encode("<tiff:-orientation>", encoding), ["tiff:orientation"])).toBe(false);
  });

  it("handles needles across blocks and NULL-only blocks", () => {
    const bytes = utf8(" ".repeat(TEXT_SCAN_BLOCK_BYTES - 5) + "tiff:" + "\0".repeat(TEXT_SCAN_BLOCK_BYTES * 2) + "orientation");
    expect(containsMetadataText(bytes, ["tiff:orientation"])).toBe(true);
    expect(containsMetadataText(bytes, [])).toBe(false);
  });

  it("checks cancellation before decoding", () => {
    const checkpoint = () => { throw new Error("aborted"); };
    expect(() => containsMetadataText(utf8("xmpmeta"), ["xmpmeta"], checkpoint)).toThrow("aborted");
  });
});

function encode(text: string, encoding: Encoding): Uint8Array {
  if (encoding === "utf-8") return utf8(text);
  const bytes = new Uint8Array(text.length * (encoding === "latin1" ? 1 : 2));
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < text.length; index += 1) {
    if (encoding === "latin1") bytes[index] = text.charCodeAt(index);
    else view.setUint16(index * 2, text.charCodeAt(index), encoding === "utf-16le");
  }
  return bytes;
}
