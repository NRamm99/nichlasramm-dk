import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");

function iconSvg(size, { rounded, padRatio }) {
  const pad = size * padRatio;
  const inner = size - pad * 2;
  const scale = inner / 32;
  const rx = rounded ? size * 0.22 : 0;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rx}" fill="#07140f"/>
  <g transform="translate(${pad} ${pad}) scale(${scale})">
    <circle cx="16" cy="16" r="9" fill="#d6ff3d"/>
    <path d="M10 13c3 2 9 2 12 0" fill="none" stroke="#07140f" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M11 19c2.5-1.5 7.5-1.5 10 0" fill="none" stroke="#07140f" stroke-width="1.2" stroke-linecap="round"/>
  </g>
</svg>`;
}

async function writePng(name, size, options) {
  const png = await sharp(Buffer.from(iconSvg(size, options)))
    .png()
    .toBuffer();
  await writeFile(join(outDir, name), png);
}

await mkdir(outDir, { recursive: true });
await writePng("icon-192.png", 192, { rounded: true, padRatio: 0 });
await writePng("icon-512.png", 512, { rounded: true, padRatio: 0 });
await writePng("icon-maskable-512.png", 512, { rounded: false, padRatio: 0.18 });
await writePng("apple-touch-icon.png", 180, { rounded: true, padRatio: 0 });
console.log("Wrote PWA icons to public/icons");
