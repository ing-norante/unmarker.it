import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const distDir = path.join(rootDir, "dist");
const serverDir = path.join(distDir, "server");
const indexPath = path.join(distDir, "index.html");
const serverEntry = path.join(serverDir, "entry-server.js");

const [{ render, applyDocumentMetadataToHtml }, template] = await Promise.all([
  import(pathToFileURL(serverEntry).href),
  readFile(indexPath, "utf8"),
]);

for (const locale of ["en", "zh-Hans"]) {
  const { appHtml, documentMetadata } = await render(locale);
  let prerendered = template.replace(
    '<div id="root"></div>',
    `<div id="root">${appHtml}</div>`,
  );
  prerendered = applyDocumentMetadataToHtml(prerendered, documentMetadata);

  if (!prerendered.includes("Dark mode initialization")) {
    throw new Error(`Theme initialization script was lost for ${locale}`);
  }
  if (/(?:src|href)=["'](?:\.\/)?assets\//i.test(prerendered)) {
    throw new Error(`Relative asset URL found in prerendered ${locale} HTML`);
  }

  const outputPath = locale === "en"
    ? indexPath
    : path.join(distDir, "zh-hans", "index.html");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, prerendered);
}
await rm(serverDir, { recursive: true, force: true });
