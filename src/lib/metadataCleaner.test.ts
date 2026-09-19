import { describe, expect, it } from "vitest";
import { cleanImageMetadata, scanImageMetadata } from "./metadataCleaner";
import { deflateSync } from "node:zlib";
import { PNG_TEXT_CHUNK_LIMIT } from "./metadata/formats/png";
import { inferAiProvenanceScore } from "./aiProvenanceScore";

const PNG_SIGNATURE = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const C2PA_UUID = bytes([
  0xd8, 0xfe, 0xc3, 0xd6, 0x1b, 0x0e, 0x48, 0x3c, 0x92, 0x97, 0x58, 0x28, 0x87,
  0x7e, 0xc4, 0x81,
]);

describe("metadataCleaner scanner", () => {
  it("detects PNG text metadata with parameters, prompt, and workflow keys", async () => {
    const file = fixtureFile(
      "ai.png",
      "image/png",
      makePng([
        pngChunk("IHDR", bytes(13)),
        pngChunk(
          "tEXt",
          textBytes("parameters\0prompt: sunny workflow comfyui"),
        ),
        pngChunk("IDAT", bytes([1, 2, 3, 4])),
        pngChunk("IEND", bytes([])),
      ]),
    );

    const result = await scanImageMetadata(file);

    expect(result.format).toBe("png");
    expect(result.hasAiMetadata).toBe(true);
    expect(result.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "png-text", removable: true }),
      ]),
    );
  });

  it("detects a PNG caBX C2PA chunk", async () => {
    const file = fixtureFile(
      "c2pa.png",
      "image/png",
      makePng([
        pngChunk("IHDR", bytes(13)),
        pngChunk("caBX", textBytes("c2pa manifest")),
        pngChunk("IDAT", bytes([9, 8, 7])),
        pngChunk("IEND", bytes([])),
      ]),
    );

    const result = await scanImageMetadata(file);

    expect(result.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "c2pa", location: "PNG caBX" }),
      ]),
    );
    expect(result.hasAiMetadata).toBe(false);
    expect(result.c2pa).toMatchObject({ presence: "present", verification: "incomplete", origin: "unknown" });
  });

  it("returns no signals for a clean PNG", async () => {
    const file = fixtureFile(
      "clean.png",
      "image/png",
      makePng([
        pngChunk("IHDR", bytes(13)),
        pngChunk("gAMA", bytes([0, 0, 0, 1])),
        pngChunk("IDAT", bytes([1, 2, 3])),
        pngChunk("IEND", bytes([])),
      ]),
    );

    const result = await scanImageMetadata(file);

    expect(result.hasAiMetadata).toBe(false);
    expect(result.signals).toHaveLength(0);
  });

  it("detects JPEG APP1 XMP trainedAlgorithmicMedia markers", async () => {
    const file = fixtureFile(
      "xmp.jpg",
      "image/jpeg",
      makeJpeg([
        jpegSegment(
          0xe1,
          textBytes(
            "http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>trainedAlgorithmicMedia</x:xmpmeta>",
          ),
        ),
        jpegSosWithPayload(bytes([0xaa, 0xbb, 0xff, 0xd9])),
      ]),
    );

    const result = await scanImageMetadata(file);

    expect(result.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "xmp", location: "JPEG APP1 XMP" }),
      ]),
    );
  });

  it("detects JPEG APP11 C2PA segments", async () => {
    const file = fixtureFile(
      "c2pa.jpg",
      "image/jpeg",
      makeJpeg([
        jpegSegment(0xeb, concat([textBytes("JUMBF"), C2PA_UUID])),
        jpegSosWithPayload(bytes([1, 2, 3])),
      ]),
    );

    const result = await scanImageMetadata(file);

    expect(result.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "c2pa", location: "JPEG APP11" }),
      ]),
    );
  });

  it("detects WebP XMP chunks with OpenAI/C2PA markers", async () => {
    const file = fixtureFile(
      "ai.webp",
      "image/webp",
      makeWebp([
        riffChunk("VP8 ", bytes([1, 2, 3, 4])),
        riffChunk("XMP ", textBytes("<xmp>openai c2pa</xmp>")),
      ]),
    );

    const result = await scanImageMetadata(file);

    expect(result.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "webp-metadata",
          location: "WebP XMP",
        }),
      ]),
    );
  });

  it("detects fake AVIF C2PA uuid boxes", async () => {
    const file = fixtureFile(
      "ai.avif",
      "image/avif",
      concat([
        box("ftyp", concat([textBytes("avif"), bytes([0, 0, 0, 0])])),
        box("uuid", concat([C2PA_UUID, textBytes("manifest")])),
      ]),
    );

    const result = await scanImageMetadata(file);

    expect(result.format).toBe("avif");
    expect(result.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "c2pa", location: "ISOBMFF uuid" }),
      ]),
    );
  });
});

describe("metadataCleaner cleaner", () => {
  it("removes only AI PNG text/C2PA chunks and preserves IDAT bytes", async () => {
    const idat = bytes([7, 7, 7, 7, 7]);
    const file = fixtureFile(
      "ai.png",
      "image/png",
      makePng([
        pngChunk("IHDR", bytes(13)),
        pngChunk("pHYs", bytes([0, 0, 0, 1, 0, 0, 0, 1, 1])),
        pngChunk("tEXt", textBytes("prompt\0midjourney prompt")),
        pngChunk("caBX", textBytes("c2pa")),
        pngChunk("IDAT", idat),
        pngChunk("IEND", bytes([])),
      ]),
    );

    const result = await cleanImageMetadata(file);
    const cleaned = new Uint8Array(await result.blob.arrayBuffer());

    expect(result.fileName).toBe("ai-metadata-cleaned.png");
    expect(result.removedCount).toBe(2);
    expect(ascii(cleaned)).not.toContain("tEXt");
    expect(ascii(cleaned)).not.toContain("caBX");
    expect(containsSequence(cleaned, idat)).toBe(true);
  });

  it("removes C2PA but preserves EXIF and ICC that can control image display", async () => {
    const compressedPayload = bytes([0x11, 0x22, 0xff, 0x00, 0x33, 0xff, 0xd9]);
    const file = fixtureFile(
      "ai.jpg",
      "image/jpeg",
      makeJpeg([
        jpegSegment(0xe1, textBytes("Exif\0\0Software=stable_diffusion")),
        jpegSegment(0xe2, textBytes("ICC_PROFILE\0profile")),
        jpegSegment(0xeb, concat([C2PA_UUID, textBytes("c2pa")])),
        jpegSosWithPayload(compressedPayload),
      ]),
    );

    const result = await cleanImageMetadata(file);
    const cleaned = new Uint8Array(await result.blob.arrayBuffer());

    expect(result.removedCount).toBe(1);
    expect(ascii(cleaned)).toContain("stable_diffusion");
    expect(ascii(cleaned)).toContain("ICC_PROFILE");
    expect(result.warnings).toContainEqual({ code: "display-metadata-preserved" });
    expect(containsSequence(cleaned, compressedPayload)).toBe(true);
  });

  it("updates WebP RIFF size after metadata chunk removal", async () => {
    const file = fixtureFile(
      "ai.webp",
      "image/webp",
      makeWebp([
        riffChunk("VP8 ", bytes([1, 2, 3, 4])),
        riffChunk("XMP ", textBytes("openai c2pa")),
      ]),
    );

    const result = await cleanImageMetadata(file);
    const cleaned = new Uint8Array(await result.blob.arrayBuffer());
    const view = new DataView(cleaned.buffer);

    expect(result.removedCount).toBe(1);
    expect(view.getUint32(4, true)).toBe(cleaned.length - 8);
    expect(ascii(cleaned)).not.toContain("XMP ");
    expect(ascii(cleaned)).toContain("VP8 ");
  });

  it("removes ISOBMFF C2PA uuid boxes and keeps mdat bytes", async () => {
    const mdatPayload = bytes([1, 3, 3, 7]);
    const file = fixtureFile(
      "ai.avif",
      "image/avif",
      concat([
        box("ftyp", concat([textBytes("avif"), bytes([0, 0, 0, 0])])),
        box("uuid", concat([C2PA_UUID, textBytes("manifest")])),
        box("mdat", mdatPayload),
      ]),
    );

    const result = await cleanImageMetadata(file);
    const cleaned = new Uint8Array(await result.blob.arrayBuffer());

    expect(result.removedCount).toBe(1);
    expect(ascii(cleaned)).not.toContain("uuid");
    expect(ascii(cleaned)).toContain("mdat");
    expect(containsSequence(cleaned, mdatPayload)).toBe(true);
    expect(cleaned.length).toBe(file.size);
    expect(ascii(cleaned)).toContain("free");
    const original = new Uint8Array(await file.arrayBuffer());
    expect(ascii(cleaned).indexOf("mdat")).toBe(ascii(original).indexOf("mdat"));
  });

  it("does not crash on unsupported or malformed files", async () => {
    const file = fixtureFile(
      "broken.bin",
      "application/octet-stream",
      bytes([1, 2, 3, 4, 5]),
    );

    const scan = await scanImageMetadata(file);
    const result = await cleanImageMetadata(file);

    expect(scan.warnings.length).toBeGreaterThan(0);
    expect(result.removedCount).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("metadata parser resource and container safeguards", () => {
  it.each(["png", "jpeg", "webp"])("retains every %s segment marker for provider, AI declaration and remote provenance", async (format) => {
    for (const text of ["parameters openai trainedAlgorithmicMedia dcterms:provenance", "dcterms:provenance trainedAlgorithmicMedia openai parameters"]) {
      const payload = textBytes(text);
      const data = format === "png" ? makePng([pngChunk("tEXt", concat([textBytes("Comment\0"), payload])), pngChunk("IEND", bytes([]))])
        : format === "jpeg" ? makeJpeg([jpegSegment(0xe1, concat([textBytes("http://ns.adobe.com/xap/1.0/\0"), payload])), jpegSosWithPayload(bytes([1, 2, 0xff, 0xd9]))])
          : makeWebp([riffChunk("VP8 ", bytes([1, 2, 3, 4])), riffChunk("XMP ", payload)]);
      const file = fixtureFile(`combined.${format}`, `image/${format}`, data);
      const scan = await scanImageMetadata(file);
      expect(scan.signals).toHaveLength(1);
      expect(scan.signals[0].marker).toBe("parameters");
      expect(scan.signals[0].markers).toEqual(expect.arrayContaining(["parameters", "openai", "trainedAlgorithmicMedia", "dcterms:provenance"]));
      expect(scan.c2pa?.presence).toBe("referenced");
      expect(inferAiProvenanceScore(scan, null, "not-detected")).toMatchObject({ kind: "strong", provider: "OpenAI", percentage: null });
      expect((await cleanImageMetadata(file)).removedCount).toBe(1);
    }
  });

  it("keeps the report-v1 representative marker when the complete evidence includes another provider", async () => {
    const file = fixtureFile("provider.png", "image/png", makePng([pngChunk("tEXt", textBytes("prompt\0midjourney")), pngChunk("IEND", bytes([]))]));
    const scan = await scanImageMetadata(file);
    expect(scan.signals[0]).toMatchObject({ marker: "prompt", markers: ["prompt", "midjourney"] });
    expect(inferAiProvenanceScore(scan, null, "not-detected").provider).toBe("Midjourney");
  });

  it("uses the same conservative budget policy for scans and cleaning", async () => {
    const data = makePng([pngChunk("caBX", textBytes("c2pa")), pngChunk("tEXt", textBytes("Comment\0openai and additional metadata")), pngChunk("IEND", bytes([]))]);
    const file = fixtureFile("limited.png", "image/png", data);
    const options = { budget: { metadataBytesRemaining: 8 } };
    const scan = await scanImageMetadata(file, options);
    const clean = await cleanImageMetadata(file, options);
    expect(scan.warnings).toContainEqual({ code: "metadata-scan-limit" });
    expect(clean.warnings).toEqual(scan.warnings);
    expect(clean.blob).toBe(file);
    expect(clean.removedCount).toBe(0);
  });

  it("does not apply a known C2PA removal when later text decompression fails", async () => {
    const file = fixtureFile("partial.png", "image/png", makePng([
      pngChunk("caBX", textBytes("c2pa")),
      pngChunk("zTXt", concat([textBytes("Comment\0"), bytes([0, 42, 42])])),
      pngChunk("IEND", bytes([])),
    ]));
    const scan = await scanImageMetadata(file);
    const result = await cleanImageMetadata(file);
    expect(result.warnings).toEqual(scan.warnings);
    expect(result.warnings).toContainEqual({ code: "png-decode-partial", values: { type: "PNG zTXt" } });
    expect(result.blob).toBe(file);
    expect(result.removedCount).toBe(0);
  });

  it("removes all APP11 fragments of a C2PA instance without dropping unrelated JUMBF", async () => {
    const file = fixtureFile("fragmented.jpg", "image/jpeg", makeJpeg([
      jpegSegment(0xeb, concat([bytes([0x4a, 0x50, 0, 7, 0, 0, 0, 1]), textBytes("c2pa manifest")])),
      jpegSegment(0xeb, concat([bytes([0x4a, 0x50, 0, 7, 0, 0, 0, 2]), textBytes("private continuation")])),
      jpegSegment(0xeb, concat([bytes([0x4a, 0x50, 0, 8, 0, 0, 0, 1]), textBytes("unrelated JUMBF")])),
      jpegSosWithPayload(bytes([1, 2, 3, 0xff, 0xd9])),
    ]));
    const result = await cleanImageMetadata(file);
    expect(result.removedCount).toBe(2);
    const output = ascii(new Uint8Array(await result.blob.arrayBuffer()));
    expect(output).not.toContain("private continuation");
    expect(output).toContain("unrelated JUMBF");
  });

  it("bounds zTXt expansion before allocating a full decompression bomb", async () => {
    const compressed = deflateSync(new Uint8Array(PNG_TEXT_CHUNK_LIMIT + 1).fill(65));
    const file = fixtureFile("bomb.png", "image/png", makePng([
      pngChunk("IHDR", bytes(13)),
      pngChunk("zTXt", concat([textBytes("Comment\0"), bytes([0]), compressed])),
      pngChunk("IEND", bytes([])),
    ]));
    const result = await scanImageMetadata(file);
    expect(result.warnings).toContainEqual({ code: "png-text-limit" });
    expect(result.hasAiMetadata).toBe(false);
  });

  it("applies a total text budget across individually acceptable PNG chunks", async () => {
    const compressed = deflateSync(new Uint8Array(PNG_TEXT_CHUNK_LIMIT - 100).fill(65));
    const file = fixtureFile("many.png", "image/png", makePng([
      pngChunk("IHDR", bytes(13)),
      ...Array.from({ length: 5 }, () => pngChunk("zTXt", concat([textBytes("Comment\0"), bytes([0]), compressed]))),
      pngChunk("IEND", bytes([])),
    ]));
    expect((await scanImageMetadata(file)).warnings).toContainEqual({ code: "png-text-limit" });
  });

  it("clears removed XMP's VP8X bit without changing alpha, animation, ICC or retained EXIF", async () => {
    const file = fixtureFile("features.webp", "image/webp", makeWebp([
      riffChunk("VP8X", bytes([0x3e, 0, 0, 0, 1, 0, 0, 1, 0, 0])),
      riffChunk("ICCP", textBytes("profile")),
      riffChunk("EXIF", textBytes("Exif orientation=6")),
      riffChunk("XMP ", textBytes("openai")),
      riffChunk("VP8 ", bytes([1, 2, 3])),
    ]));
    const cleaned = new Uint8Array(await (await cleanImageMetadata(file)).blob.arrayBuffer());
    expect(cleaned[20]).toBe(0x3a);
    expect(ascii(cleaned)).toContain("ICCP");
    expect(ascii(cleaned)).toContain("EXIF");
  });

  it("refuses a RIFF length that extends past the actual file", async () => {
    const data = makeWebp([riffChunk("XMP ", textBytes("openai"))]);
    new DataView(data.buffer).setUint32(4, data.length + 100, true);
    const file = fixtureFile("truncated.webp", "image/webp", data);
    const result = await cleanImageMetadata(file);
    expect(result.blob).toBe(file);
    expect(result.warnings).toContainEqual({ code: "webp-size-exceeds-file" });
  });

  it("preserves AVIF item offsets and explicitly discloses unscanned nested metadata", async () => {
    const data = concat([
      box("ftyp", concat([textBytes("avif"), bytes([0, 0, 0, 0])])),
      box("meta", concat([bytes(4), box("iloc", bytes([1, 2, 3, 4]))])),
      box("uuid", concat([C2PA_UUID, textBytes("private manifest")])),
      box("mdat", bytes([8, 6, 7, 5])),
    ]);
    const file = fixtureFile("offsets.avif", "image/avif", data);
    const result = await cleanImageMetadata(file);
    const output = new Uint8Array(await result.blob.arrayBuffer());
    expect(result.removedCount).toBe(1);
    expect(result.warnings).toContainEqual({ code: "box-item-coverage" });
    expect(output.length).toBe(data.length);
    expect(ascii(output).indexOf("mdat")).toBe(ascii(data).indexOf("mdat"));
    expect(ascii(output)).not.toContain("private manifest");
    expect(output.slice(ascii(data).indexOf("meta") - 4, ascii(data).indexOf("uuid") - 4))
      .toEqual(data.slice(ascii(data).indexOf("meta") - 4, ascii(data).indexOf("uuid") - 4));
  });

  it.each(["png", "jpeg"])("refuses partial edits to malformed %s container tables", async (format) => {
    const data = format === "png" ? makePng([pngChunk("caBX", textBytes("c2pa")), bytes([0, 1])])
      : makeJpeg([jpegSegment(0xeb, textBytes("c2pa")), bytes([0xff, 0xe1, 0, 40])]);
    const file = fixtureFile(`broken.${format}`, `image/${format}`, data);
    const result = await cleanImageMetadata(file);
    expect(result.blob).toBe(file);
    expect(result.removedCount).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

function fixtureFile(name: string, type: string, data: Uint8Array) {
  return new File([toArrayBuffer(data)], name, { type });
}

function makePng(chunks: Uint8Array[]) {
  return concat([PNG_SIGNATURE, ...chunks]);
}

function pngChunk(type: string, data: Uint8Array) {
  const output = new Uint8Array(12 + data.length);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.length);
  output.set(textBytes(type), 4);
  output.set(data, 8);
  return output;
}

function makeJpeg(parts: Uint8Array[]) {
  return concat([bytes([0xff, 0xd8]), ...parts]);
}

function jpegSegment(marker: number, payload: Uint8Array) {
  const output = new Uint8Array(payload.length + 4);
  const view = new DataView(output.buffer);
  output[0] = 0xff;
  output[1] = marker;
  view.setUint16(2, payload.length + 2);
  output.set(payload, 4);
  return output;
}

function jpegSosWithPayload(payload: Uint8Array) {
  return concat([jpegSegment(0xda, bytes([0, 1])), payload]);
}

function makeWebp(chunks: Uint8Array[]) {
  const body = concat(chunks);
  const output = new Uint8Array(12 + body.length);
  const view = new DataView(output.buffer);
  output.set(textBytes("RIFF"), 0);
  view.setUint32(4, output.length - 8, true);
  output.set(textBytes("WEBP"), 8);
  output.set(body, 12);
  return output;
}

function riffChunk(type: string, data: Uint8Array) {
  const padding = data.length % 2;
  const output = new Uint8Array(8 + data.length + padding);
  const view = new DataView(output.buffer);
  output.set(textBytes(type), 0);
  view.setUint32(4, data.length, true);
  output.set(data, 8);
  return output;
}

function box(type: string, data: Uint8Array) {
  const output = new Uint8Array(8 + data.length);
  const view = new DataView(output.buffer);
  view.setUint32(0, output.length);
  output.set(textBytes(type), 4);
  output.set(data, 8);
  return output;
}

function textBytes(value: string) {
  return new TextEncoder().encode(value);
}

function bytes(value: number | number[]) {
  if (typeof value === "number") {
    return new Uint8Array(value);
  }

  return new Uint8Array(value);
}

function concat(parts: Uint8Array[]) {
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function ascii(bytes: Uint8Array) {
  return new TextDecoder("iso-8859-1").decode(bytes);
}

function containsSequence(haystack: Uint8Array, needle: Uint8Array) {
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    let matched = true;
    for (let needleIndex = 0; needleIndex < needle.length; needleIndex += 1) {
      if (haystack[index + needleIndex] !== needle[needleIndex]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return true;
    }
  }

  return false;
}

function toArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
