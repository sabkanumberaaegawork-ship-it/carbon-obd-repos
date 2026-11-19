import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SIZES = [180, 192, 512];
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

function roundedRectContains(x, y, min, max, radius) {
  if (x < min || x > max || y < min || y > max) return false;
  const cx = Math.min(Math.max(x, min + radius), max - radius);
  const cy = Math.min(Math.max(y, min + radius), max - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function inkAt(nx, ny) {
  if (!roundedRectContains(nx, ny, 0.05, 0.95, 0.17)) return false;
  if (roundedRectContains(nx, ny, 0.095, 0.905, 0.13)) {
    const dx = nx - 0.47;
    const dy = ny - 0.5;
    const distance = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const isArc =
      distance > 0.175 &&
      distance < 0.245 &&
      Math.abs(angle) > 48;
    const isDot = Math.hypot(nx - 0.735, ny - 0.5) < 0.035;
    return isArc || isDot;
  }
  return true;
}

function makeRgba(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let ink = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const nx = (x + (sx + 0.5) / samples) / size;
          const ny = (y + (sy + 0.5) / samples) / size;
          if (inkAt(nx, ny)) ink += 1;
        }
      }
      const shade = Math.round(255 * (1 - ink / (samples * samples)));
      const offset = (y * size + x) * 4;
      rgba[offset] = shade;
      rgba[offset + 1] = shade;
      rgba[offset + 2] = shade;
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of SIZES) {
  const name = size === 180 ? "apple-icon.png" : `icon-${size}.png`;
  const png = encodePng(size, makeRgba(size));
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`wrote ${name} (${png.length} bytes)`);
}
