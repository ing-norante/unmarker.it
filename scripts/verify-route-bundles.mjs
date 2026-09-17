import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const dist = new URL("../dist/", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL(".vite/manifest.json", dist), "utf8"),
);

function dependencies(...roots) {
  const seen = new Set();
  function visit(key) {
    if (seen.has(key)) return;
    seen.add(key);
    assert.ok(manifest[key], `Missing chunk: ${key}`);
    for (const dependency of manifest[key].imports ?? []) visit(dependency);
  }
  roots.forEach(visit);
  return seen;
}

const home = "src/App.tsx";
const sponsor = "src/SponsorshipPage.tsx";
const billing = "src/components/SponsorBillingForm.tsx";
const workflow = "src/WorkflowApp.tsx";
for (const [route, deferred] of [
  [home, [sponsor, billing, workflow]],
  [sponsor, [home, billing, workflow]],
]) {
  const initial = dependencies("index.html", route);
  for (const key of deferred) {
    assert.ok(
      manifest[key]?.isDynamicEntry,
      `Expected a separate dynamic chunk: ${key}`,
    );
    assert.ok(
      !initial.has(key),
      `Unexpected initial dependency of ${route}: ${key}`,
    );
  }
  for (const locale of ["", "zh-hans/"]) {
    const pathname = `${locale}${route === sponsor ? "sponsorship/" : ""}index.html`;
    const html = await readFile(new URL(pathname, dist), "utf8");
    const preloads = [
      ...html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g),
    ].map((match) => match[1]);
    for (const key of initial) {
      const file = `/${manifest[key].file}`;
      if (key === "index.html") assert.ok(html.includes(`src="${file}"`));
      else
        assert.ok(
          preloads.includes(file),
          `Missing preload in ${pathname}: ${file}`,
        );
    }
    for (const key of deferred)
      assert.ok(
        !preloads.includes(`/${manifest[key].file}`),
        `Deferred chunk preloaded in ${pathname}: ${key}`,
      );
  }
  let raw = 0;
  let gzip = 0;
  for (const key of initial) {
    const bytes = await readFile(new URL(manifest[key].file, dist));
    raw += bytes.length;
    gzip += gzipSync(bytes, { level: 9 }).length;
  }
  console.log(
    `${route}: ${initial.size} initial JS chunks, ${raw} bytes (${gzip} bytes gzip)`,
  );
}
