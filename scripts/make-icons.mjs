/**
 * Генерирует PNG-иконки без внешних зависимостей: рисуем в буфер пикселей
 * и упаковываем PNG вручную через zlib. Никаких сторонних пакетов.
 */
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [0x0a, 0x0c, 0x0f];
const ACCENT = [0xc9, 0xf7, 0x3b];

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0);
  return Buffer.concat([len, t, data, c]);
}

function encodePng(size, pixel) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * stride + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Штанга: гриф, замки, два блина с каждой стороны. Координаты 0..1. */
const BAR_PARTS = [
  [0.155, 0.455, 0.845, 0.545], // гриф
  [0.105, 0.375, 0.175, 0.625], // левый внешний блин
  [0.205, 0.285, 0.285, 0.715], // левый внутренний блин
  [0.715, 0.285, 0.795, 0.715], // правый внутренний блин
  [0.825, 0.375, 0.895, 0.625], // правый внешний блин
];

function makePixel(size, scale) {
  // scale < 1 — ужимаем глиф внутрь безопасной зоны maskable-иконки
  const shrink = (v) => 0.5 + (v - 0.5) * scale;
  const parts = BAR_PARTS.map(([x0, y0, x1, y1]) => [
    shrink(x0) * size, shrink(y0) * size, shrink(x1) * size, shrink(y1) * size,
  ]);
  const radius = 0.02 * size * scale;

  return (px, py) => {
    const x = px + 0.5;
    const y = py + 0.5;
    for (const [x0, y0, x1, y1] of parts) {
      // прямоугольник со скруглением: расстояние до внутреннего прямоугольника
      const dx = Math.max(x0 + radius - x, 0, x - (x1 - radius));
      const dy = Math.max(y0 + radius - y, 0, y - (y1 - radius));
      if (Math.hypot(dx, dy) <= radius) return [...ACCENT, 255];
    }
    return [...BG, 255];
  };
}

mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true });

const targets = [
  ['icon-192.png', 192, 0.78],
  ['icon-512.png', 512, 0.78],
  ['icon-maskable-512.png', 512, 0.58],
  ['apple-touch-icon.png', 180, 0.78],
];

for (const [name, size, scale] of targets) {
  const buf = encodePng(size, makePixel(size, scale));
  writeFileSync(new URL(`../public/icons/${name}`, import.meta.url), buf);
  console.log(name, size + 'x' + size, buf.length + ' байт');
}
