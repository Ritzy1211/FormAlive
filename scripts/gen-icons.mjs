// Generates branded PNG icons for the extension using node-canvas-free
// pure-PNG output. Run with: `node scripts/gen-icons.mjs`
// Produces src/assets/icon-{16,48,128}.png with a green rounded square and
// a white "F" mark.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'src', 'assets');
mkdirSync(OUT, { recursive: true });

// ---- Tiny PNG encoder (truecolor + alpha, no deps) ----
function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = (table[(crc ^ b) & 0xff] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}
function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = u32(data.length);
  const crc = u32(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.concat([u32(w), u32(h), Buffer.from([8, 6, 0, 0, 0])]);
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---- Drawing primitives on an RGBA buffer ----
function makeBuffer(size) {
  return Buffer.alloc(size * size * 4); // transparent
}
function setPixel(buf, size, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  // Source-over composite
  const da = buf[i + 3] / 255;
  const sa = a / 255;
  const outA = sa + da * (1 - sa);
  if (outA === 0) return;
  buf[i] = Math.round((r * sa + buf[i] * da * (1 - sa)) / outA);
  buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / outA);
  buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / outA);
  buf[i + 3] = Math.round(outA * 255);
}
function fillRoundedRect(buf, size, x0, y0, x1, y1, radius, r, g, b, a) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      // Distance to nearest corner
      let dx = 0, dy = 0;
      if (x < x0 + radius) dx = x0 + radius - x;
      else if (x >= x1 - radius) dx = x - (x1 - radius - 1);
      if (y < y0 + radius) dy = y0 + radius - y;
      else if (y >= y1 - radius) dy = y - (y1 - radius - 1);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= radius) {
        // antialias edge
        const aa = Math.max(0, Math.min(1, radius - d));
        setPixel(buf, size, x, y, r, g, b, Math.round(a * aa));
      }
    }
  }
}
function fillRect(buf, size, x0, y0, x1, y1, r, g, b, a) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) setPixel(buf, size, x, y, r, g, b, a);
  }
}

function drawIcon(size) {
  const buf = makeBuffer(size);
  // Emerald-600 background (#059669)
  const pad = Math.max(1, Math.round(size * 0.05));
  const radius = Math.round(size * 0.22);
  fillRoundedRect(buf, size, pad, pad, size - pad, size - pad, radius, 5, 150, 105, 255);

  // White "F" — three rectangles. Sized proportionally.
  const left = Math.round(size * 0.32);
  const top = Math.round(size * 0.22);
  const bottom = Math.round(size * 0.78);
  const stroke = Math.max(2, Math.round(size * 0.1));
  const armRight = Math.round(size * 0.7);
  const midY = Math.round(size * 0.46);

  // vertical bar
  fillRect(buf, size, left, top, left + stroke, bottom, 255, 255, 255, 255);
  // top arm
  fillRect(buf, size, left, top, armRight, top + stroke, 255, 255, 255, 255);
  // mid arm (shorter)
  fillRect(buf, size, left, midY, Math.round(armRight * 0.9), midY + stroke, 255, 255, 255, 255);

  return encodePng(size, size, buf);
}

for (const size of [16, 48, 128]) {
  const out = resolve(OUT, `icon-${size}.png`);
  writeFileSync(out, drawIcon(size));
  console.log('wrote', out);
}
