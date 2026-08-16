import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [template, en, zh, sitemap, vercel] = await Promise.all([
  readFile(path.join(root, "index.html"), "utf8"),
  readFile(path.join(root, "dist/index.html"), "utf8"),
  readFile(path.join(root, "dist/zh-hans/index.html"), "utf8"),
  readFile(path.join(root, "dist/sitemap.xml"), "utf8"),
  readFile(path.join(root, "vercel.json"), "utf8"),
]);

assertIncludes(zh, '<html lang="zh-Hans" data-locale="zh-Hans">');
assertIncludes(zh, '<link id="meta-canonical" rel="canonical" href="https://www.unmarker.it/zh-hans/"');
assertIncludes(zh, 'property="og:locale" content="zh_CN"');
assertIncludes(zh, "https://www.unmarker.it/og-image-zh-hans.png");
assertIncludes(zh, '"@id":"https://www.unmarker.it/zh-hans/#webpage"');
assertIncludes(zh, '"inLanguage":["en","zh-Hans"]');
assertIncludes(zh, "拖入图片");
assertIncludes(en, '<html lang="en" data-locale="en">');

for (const phrase of [
  "Drag an image", "WORKFLOW", "Needs attention", "Core facts",
  "Analyze, remove, and verify", "Built with", "No cleanup needed", "Failed",
]) {
  if (zh.includes(phrase)) throw new Error(`Denied English UI phrase in Chinese HTML: ${phrase}`);
}
if (/(?:src|href)=["'](?:\.\/)?assets\//i.test(zh)) {
  throw new Error("Chinese HTML contains a relative asset URL");
}

const themePattern = /<script>\s*\/\/ Dark mode initialization[\s\S]*?<\/script>/;
if (template.match(themePattern)?.[0] !== zh.match(themePattern)?.[0]) {
  throw new Error("Theme initialization script changed during prerender");
}

assertIncludes(sitemap, 'xmlns:xhtml="http://www.w3.org/1999/xhtml"');
assertIncludes(sitemap, "https://www.unmarker.it/zh-hans/");
assertIncludes(sitemap, 'hreflang="x-default"');

const config = JSON.parse(vercel);
if (config.outputDirectory !== "dist") throw new Error("Vercel outputDirectory must be dist");
const sources = new Set(config.redirects.map((redirect) => redirect.source));
for (const source of ["/zh-hans", "/zh-Hans", "/zh-Hans/", "/zh-hans/index.html"]) {
  if (!sources.has(source)) throw new Error(`Missing Vercel redirect: ${source}`);
}
if (config.redirects.some((redirect) => redirect.statusCode !== 301)) {
  throw new Error("All locale canonicalization redirects must use HTTP 301");
}

function assertIncludes(value, expected) {
  if (!value.includes(expected)) throw new Error(`Expected generated artifact to include: ${expected}`);
}
