// Builds the extension and zips dist/ to formalive-<version>.zip for store upload.
import { execSync } from 'node:child_process';
import { createWriteStream, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

// Minimal zip writer (store-only, no compression dependency).
// Good enough for Chrome Web Store; CWS doesn't require compression.
import { createDeflateRaw } from 'node:zlib';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const outDir = 'release';
if (!existsSync(outDir)) mkdirSync(outDir);
const zipPath = join(outDir, `formalive-${pkg.version}.zip`);
if (existsSync(zipPath)) rmSync(zipPath);

console.log('▸ Building production bundle…');
execSync('npm run build', { stdio: 'inherit' });

console.log('▸ Packing dist/ →', zipPath);

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    const s = await stat(full);
    if (s.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function deflate(buf) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const z = createDeflateRaw({ level: 9 });
    z.on('data', (c) => chunks.push(c));
    z.on('end', () => resolve(Buffer.concat(chunks)));
    z.on('error', reject);
    z.end(buf);
  });
}

// CRC-32
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d = new Date()) {
  const t =
    ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const dt =
    (((d.getFullYear() - 1980) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0xf) << 5) |
    (d.getDate() & 0x1f);
  return { t, dt };
}

async function zipDir(src, dest) {
  const files = await walk(src);
  const out = createWriteStream(dest);
  const central = [];
  let offset = 0;

  for (const f of files) {
    const rel = relative(src, f).replaceAll('\\', '/');
    const data = await readFile(f);
    const compressed = await deflate(data);
    const crc = crc32(data);
    const { t, dt } = dosTime();
    const nameBuf = Buffer.from(rel, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version
    local.writeUInt16LE(0x0800, 6); // utf-8 flag
    local.writeUInt16LE(8, 8); // method = deflate
    local.writeUInt16LE(t, 10);
    local.writeUInt16LE(dt, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    out.write(local);
    out.write(nameBuf);
    out.write(compressed);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(t, 12);
    ch.writeUInt16LE(dt, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(compressed.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([ch, nameBuf]));

    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(central);
  out.write(centralBuf);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  out.end(end);

  await new Promise((res) => out.on('finish', res));
}

await zipDir('dist', zipPath);
console.log(`✓ Wrote ${zipPath}`);
