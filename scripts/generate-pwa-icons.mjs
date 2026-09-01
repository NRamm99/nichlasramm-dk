import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");

function iconSvg(size, padRatio) {
  const pad = size * padRatio;
  const inner = size - pad * 2;
  const scale = inner / 32;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#07140f"/>
  <g transform="translate(${pad} ${pad}) scale(${scale})">
    <circle cx="16" cy="16" r="10" fill="#d6ff3d"/>
    <path d="M10 13c3 2 9 2 12 0" fill="none" stroke="#07140f" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M11 19c2.5-1.5 7.5-1.5 10 0" fill="none" stroke="#07140f" stroke-width="1.3" stroke-linecap="round"/>
  </g>
</svg>`;
}

async function writePng(dir, name, size, padRatio) {
  const png = await sharp(Buffer.from(iconSvg(size, padRatio)), {
    density: 384,
  })
    .png()
    .toBuffer();
  await writeFile(join(dir, name), png);
}

await mkdir(outDir, { recursive: true });
await writePng(outDir, "icon-192.png", 192, 0.08);
await writePng(outDir, "icon-512.png", 512, 0.08);
await writePng(outDir, "icon-maskable-512.png", 512, 0.18);
await writePng(outDir, "apple-touch-icon.png", 180, 0.08);
await copyFile(
  join(outDir, "apple-touch-icon.png"),
  join(root, "public", "apple-touch-icon.png"),
);
console.log("Wrote PWA icons to public/icons and public/apple-touch-icon.png");
