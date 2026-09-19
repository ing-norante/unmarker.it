// Development-only comparison with the pre-refactor scanner; never imported by the app.
// Run each mode in a fresh Node process to compare peak RSS.
import { findTextMarkers } from "../src/lib/metadata/textScanner.ts";

const candidates = [
  "parameters",
  "prompt",
  "negative_prompt",
  "workflow",
  "comfyui",
  "generation_data",
  "stable_diffusion",
  "stable diffusion",
  "automatic1111",
  "midjourney",
  "dall-e",
  "dall e",
  "dalle",
  "imagen",
  "synthid",
  "google_ai",
  "google ai",
  "openai",
  "firefly",
  "c2pa",
  "dcterms:provenance",
  "trainedAlgorithmicMedia",
  "compositeSynthetic",
  "algorithmicMedia",
  "compositeWithTrainedAlgorithmicMedia",
];
const bytes = new Uint8Array(16 * 1024 * 1024);
let state = 12345;
for (let index = 0; index < bytes.length; index++) {
  state = (Math.imul(1664525, state) + 1013904223) >>> 0;
  bytes[index] = state >>> 24;
}
const suffix = new TextEncoder().encode(
  " openai negative prompt sd:benchmark ",
);
bytes.set(suffix, bytes.length - suffix.length);

function legacy(bytes: Uint8Array): string[] {
  const text = [
    ...new Set(
      ["utf-8", "iso-8859-1", "utf-16le", "utf-16be"].map((label) =>
        new TextDecoder(label).decode(bytes),
      ),
    ),
  ]
    .join("\n")
    .replace(/\0/g, "")
    .toLowerCase();
  const normalized = text.replace(/[^a-z0-9:*]+/g, "_");
  const matches = new Set<string>();
  for (const marker of candidates) {
    const lower = marker.toLowerCase();
    if (
      text.includes(lower) ||
      normalized.includes(lower.replace(/[^a-z0-9:*]+/g, "_"))
    )
      matches.add(marker);
  }
  const sd = text.match(/\bsd:[a-z0-9_:-]+/g);
  if (sd) matches.add(sd[0]);
  return [...matches];
}

const mode = process.argv[2];
if (mode !== "legacy" && mode !== "streaming")
  throw new Error("mode must be legacy or streaming");
const run =
  mode === "legacy"
    ? legacy
    : (data: Uint8Array) => findTextMarkers(data, candidates);
for (let i = 0; i < 3; i++) run(bytes.subarray(0, 16384));
global.gc?.();
const before = process.memoryUsage();
const started = performance.now();
const result = run(bytes);
const elapsed = performance.now() - started;
const after = process.memoryUsage();
console.log(
  JSON.stringify({
    mode,
    inputMiB: bytes.byteLength / 1048576,
    elapsedMs: Math.round(elapsed),
    rssBeforeMiB: Math.round(before.rss / 1048576),
    rssAfterMiB: Math.round(after.rss / 1048576),
    peakRssMiB: Math.round(process.resourceUsage().maxRSS / 1024),
    heapUsedBeforeMiB: Math.round(before.heapUsed / 1048576),
    heapUsedAfterMiB: Math.round(after.heapUsed / 1048576),
    result,
  }),
);
