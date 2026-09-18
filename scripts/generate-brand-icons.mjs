import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

// Keep the header mark as the single source of geometry and accent color.
// Its tight viewBox aligns to cap height; app icons retain square padding.
const publicFile = (name) => new URL(`../public/${name}`, import.meta.url);
const logo = await readFile(publicFile("unmarker-logo.svg"), "utf8");
const shapes = logo.slice(logo.indexOf(">") + 1, logo.lastIndexOf("</svg>"));
const svg = (content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 20 176 176">${content}</svg>\n`;

const adaptive = svg(`
  <style>
    .mark { fill: #0B1220; }
    @media (prefers-color-scheme: dark) {
      .mark { fill: #FFFFFF; }
    }
  </style>${shapes.replace('fill="#fff"', 'class="mark" fill="#0B1220"')}`);
await writeFile(publicFile("favicon.svg"), adaptive);

// Raster favicons have a stable dark tile in both browser themes.
// Apple applies its own corner mask, so its source has an opaque square base.
const raster = (size, rounded = true) =>
  sharp(
    Buffer.from(
      svg(
        `<rect x="18" y="20" width="176" height="176" rx="${rounded ? 32 : 0}" fill="#0B1220"/>${shapes}`,
      ),
    ),
  )
    .resize(size, size)
    .png()
    .toBuffer();

for (const [name, size, rounded] of [
  ["favicon-16x16.png", 16, true],
  ["favicon-32x32.png", 32, true],
  ["favicon-96x96.png", 96, true],
  ["android-chrome-192x192.png", 192, true],
  ["android-chrome-512x512.png", 512, true],
  ["apple-touch-icon.png", 180, false],
]) {
  await writeFile(publicFile(name), await raster(size, rounded));
}

// ICO permits PNG image entries; provide the usual three browser sizes.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((size) => raster(size)));
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
images.forEach((image, index) => {
  const entry = 6 + index * 16;
  directory[entry] = sizes[index];
  directory[entry + 1] = sizes[index];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(image.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
await writeFile(
  publicFile("favicon.ico"),
  Buffer.concat([directory, ...images]),
);

// Preserve the alternate public URL while keeping one canonical manifest.
await writeFile(
  publicFile("site.webmanifest"),
  await readFile(publicFile("manifest.webmanifest")),
);
console.log(
  "Brand icons and manifest alias regenerated from their canonical sources.",
);
