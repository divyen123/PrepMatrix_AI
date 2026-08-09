import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(projectRoot, "public", "pwa");

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = new Uint32Array(256);

for (let index = 0; index < CRC_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  CRC_TABLE[index] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuffer, data]);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  checksum.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, checksum]);
}

function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * 4;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (stride + 1);
    scanlines[rowOffset] = 0;
    pixels.copy(scanlines, rowOffset + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND"),
  ]);
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mix(from, to, amount) {
  return from + (to - from) * amount;
}

function roundedRectangle(x, y, left, top, right, bottom, radius) {
  const closestX = Math.max(left + radius, Math.min(right - radius, x));
  const closestY = Math.max(top + radius, Math.min(bottom - radius, y));
  const dx = x - closestX;
  const dy = y - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

function insideLetterP(x, y, scale = 1) {
  const u = (x - 0.5) / scale + 0.5;
  const v = (y - 0.5) / scale + 0.5;
  const stem = roundedRectangle(u, v, 0.305, 0.185, 0.425, 0.82, 0.055);
  const outer = ((u - 0.49) / 0.245) ** 2 + ((v - 0.365) / 0.19) ** 2 <= 1;
  const inner = ((u - 0.515) / 0.105) ** 2 + ((v - 0.365) / 0.085) ** 2 <= 1;
  return stem || (outer && !inner);
}

function letterCoverage(x, y, size, scale) {
  let hits = 0;
  const samples = 4;
  for (let sampleY = 0; sampleY < samples; sampleY += 1) {
    for (let sampleX = 0; sampleX < samples; sampleX += 1) {
      const u = (x + (sampleX + 0.5) / samples) / size;
      const v = (y + (sampleY + 0.5) / samples) / size;
      if (insideLetterP(u, v, scale)) hits += 1;
    }
  }
  return hits / (samples * samples);
}

function createBrandIcon(size, { maskable = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  const letterScale = maskable ? 0.82 : 0.94;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const diagonal = Math.max(0, Math.min(1, (u + v) / 2));
      const shineDistance = Math.hypot(u - 0.24, v - 0.16);
      const shine = Math.max(0, 1 - shineDistance / 0.72) * 0.27;
      const vignette = Math.max(0, Math.hypot(u - 0.5, v - 0.5) - 0.28) * 0.18;
      let red = mix(20, 13, diagonal);
      let green = mix(184, 148, diagonal);
      let blue = mix(166, 136, diagonal);
      red = mix(red, 255, shine) * (1 - vignette);
      green = mix(green, 255, shine) * (1 - vignette);
      blue = mix(blue, 255, shine) * (1 - vignette);

      const coverage = letterCoverage(x, y, size, letterScale);
      red = mix(red, 255, coverage);
      green = mix(green, 255, coverage);
      blue = mix(blue, 255, coverage);

      const offset = (y * size + x) * 4;
      pixels[offset] = clampByte(red);
      pixels[offset + 1] = clampByte(green);
      pixels[offset + 2] = clampByte(blue);
      pixels[offset + 3] = 255;
    }
  }

  return encodePng(size, size, pixels);
}

function badgeCoverage(x, y, size) {
  const u = (x + 0.5) / size;
  const v = (y + 0.5) / size;
  const distance = Math.hypot(u - 0.5, v - 0.5);
  const ring = distance <= 0.44 && distance >= 0.365;
  return ring || insideLetterP(u, v, 0.72) ? 1 : 0;
}

function createNotificationBadge(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const alpha = badgeCoverage(x, y, size) * 255;
      const offset = (y * size + x) * 4;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = alpha;
    }
  }
  return encodePng(size, size, pixels);
}

const outputs = [
  ["icon-192.png", createBrandIcon(192)],
  ["icon-512.png", createBrandIcon(512)],
  ["icon-maskable-192.png", createBrandIcon(192, { maskable: true })],
  ["icon-maskable-512.png", createBrandIcon(512, { maskable: true })],
  ["apple-touch-icon-180.png", createBrandIcon(180)],
  ["notification-badge-96.png", createNotificationBadge(96)],
];

await mkdir(outputDirectory, { recursive: true });
await Promise.all(outputs.map(([name, contents]) => writeFile(join(outputDirectory, name), contents)));
console.log(`Generated ${outputs.length} deterministic PWA icons in ${outputDirectory}`);
