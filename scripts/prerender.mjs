import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { writeLegalPages } from "./legal-pages.ts";
import { supportedLocales } from "../src/i18n/locales.ts";
import { prerenderedPath, staticDependencies } from "./build-artifacts.ts";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const distDir = path.join(rootDir, "dist");
const serverDir = path.join(distDir, "server");
const indexPath = path.join(distDir, "index.html");
const serverEntry = path.join(serverDir, "entry-server.js");

const [{ render, applyDocumentMetadataToHtml }, template, manifestJson] = await Promise.all([
  import(pathToFileURL(serverEntry).href),
  readFile(indexPath, "utf8"),
  readFile(path.join(distDir, ".vite/manifest.json"), "utf8"),
]);
const manifest = JSON.parse(manifestJson);

// Start the selected route with the document; never preload the other route
// or the billing step. Follow static imports only, leaving dynamic imports lazy.
function preloadRoute(html, page) {
  const links = [];
  const entry = page === "sponsorship" ? "src/SponsorshipPage.tsx" : "src/App.tsx";
  for (const key of staticDependencies(manifest, entry)) {
    const chunk = manifest[key];
    const href = `/${chunk.file}`;
    if (!html.includes(`"${href}"`)) {
      links.push(`<link rel="modulepreload" crossorigin href="${href}">`);
    }
  }
  return html.replace("</head>", `${links.join("\n")}\n</head>`);
}

for (const locale of supportedLocales) {
  for (const page of ["home", "sponsorship"]) {
    const { appHtml, documentMetadata } = await render(locale, page);
    let prerendered = template.replace(
      '<div id="root"></div>',
      `<div id="root">${appHtml}</div>`,
    );
    prerendered = applyDocumentMetadataToHtml(prerendered, documentMetadata);
    prerendered = preloadRoute(prerendered, page);

    if (!prerendered.includes('<meta name="color-scheme" content="dark"')) {
      throw new Error(`Dark color scheme was lost for ${locale}`);
    }
    if (/(?:src|href)=["'](?:\.\/)?assets\//i.test(prerendered)) {
      throw new Error(`Relative asset URL found in prerendered ${locale} HTML`);
    }

    const outputPath = path.join(
      distDir,
      prerenderedPath(locale, page),
    );
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, prerendered);
  }
}
await writeLegalPages(distDir, template);
await rm(serverDir, { recursive: true, force: true });
