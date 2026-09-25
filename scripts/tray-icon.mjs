// Generates the PrismDesk tray gem as a PNG with no third-party dependency or binary asset in the
// repository. The gem matches the settings window brand mark; the geometry is defined here.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c; }
  return table;
})();

function crc32(buffer) { let c = -1; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }

function chunk(type, data) {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

export function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Unit-square gem: table, two girdle corners and the culet, plus a highlight facet.
const gem = [[0.3125, 0.2656], [0.6875, 0.2656], [0.8594, 0.4688], [0.5, 0.875], [0.1406, 0.4688]];
const crown = [[0.3125, 0.2656], [0.6875, 0.2656], [0.75, 0.4688], [0.25, 0.4688]];
const facet = [[0.4063, 0.2969], [0.5938, 0.2969], [0.5, 0.4375]];
const top = [139, 124, 255], bottom = [34, 211, 238];

function inside(polygon, x, y) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function mix(color, amount) { return color.map((value, index) => Math.round(value + ([255, 255, 255][index] - value) * amount)); }

export function renderTrayIcon(size, samples = 4) {
  const pixels = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let alpha = 0, red = 0, green = 0, blue = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / size, y = (py + (sy + 0.5) / samples) / size;
          if (!inside(gem, x, y)) continue;
          const t = Math.min(1, Math.max(0, (y - 0.25) / 0.65));
          const base = top.map((value, index) => Math.round(value + (bottom[index] - value) * t));
          const color = inside(facet, x, y) ? mix(base, 0.55) : inside(crown, x, y) ? mix(base, 0.22) : base;
          alpha += 1; red += color[0]; green += color[1]; blue += color[2];
        }
      }
      const total = samples * samples;
      if (!alpha) continue;
      const offset = (py * size + px) * 4;
      pixels[offset] = Math.round(red / alpha); pixels[offset + 1] = Math.round(green / alpha);
      pixels[offset + 2] = Math.round(blue / alpha); pixels[offset + 3] = Math.round((alpha / total) * 255);
    }
  }
  return encodePng(size, size, pixels);
}

export async function writeTrayIcons(directory) {
  await mkdir(directory, { recursive: true });
  for (const [name, size] of [['tray.png', 32], ['tray@2x.png', 64]]) {
    await writeFile(`${directory}/${name}`, renderTrayIcon(size));
    console.log(`generated ${dirname(`${directory}/${name}`)}/${name} (${size}x${size})`);
  }
}
