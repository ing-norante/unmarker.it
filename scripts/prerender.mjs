import { readFile, rm, writeFile } from "node:fs/promises";
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

const [{ render }, template] = await Promise.all([
  import(pathToFileURL(serverEntry).href),
  readFile(indexPath, "utf8"),
]);

const appHtml = render();
const prerendered = template.replace(
  '<div id="root"></div>',
  `<div id="root">${appHtml}</div>`,
);

await writeFile(indexPath, prerendered);
await rm(serverDir, { recursive: true, force: true });
