/**
 * gen-icons.js — 用 Node 标准库直接生成 PNG 图标，不引入任何依赖。
 *
 * 手写 PNG 编码器：IHDR + IDAT(zlib) + IEND，逐行加 filter byte 0。
 * 图形：深色圆角方块 + 焦赭色字母 K 的笔画（与 favicon.svg 一致）。
 *
 * 用法：node tools/gen-icons.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- PNG 编码 ---------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // 每行前置一个 filter byte（0 = None）
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- 绘图 ---------- */

const BG = [0x1b, 0x1c, 0x1e, 255];        // --ink
const FG = [0xdd, 0x84, 0x52, 255];        // --accent（暗色主题下的强调色）
const TRANSPARENT = [0, 0, 0, 0];

function draw(size) {
  const buf = Buffer.alloc(size * size * 4);
  const px = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = c[3];
  };

  const s = size / 64;                       // 以 64 为基准缩放
  const radius = 14 * s;
  const stroke = 5.5 * s;                    // 笔画粗细
  const half = stroke / 2;

  // 1) 圆角矩形背景
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inRoundedRect(x, y, size, radius)) px(x, y, BG);
      else px(x, y, TRANSPARENT);
    }
  }

  // 2) 字母 K：竖笔 + 上斜笔 + 下斜笔（与 SVG path 对应）
  //    SVG: M22 16v32  M22 32l16-16  M22 32l17 16
  const segs = [
    { x1: 22, y1: 16, x2: 22, y2: 48 },      // 竖
    { x1: 22, y1: 32, x2: 38, y2: 16 },      // 上斜
    { x1: 22, y1: 32, x2: 39, y2: 48 },      // 下斜
  ];
  for (const seg of segs) {
    drawStroke(px, seg.x1 * s, seg.y1 * s, seg.x2 * s, seg.y2 * s, half, FG);
  }

  return buf;
}

function inRoundedRect(x, y, size, r) {
  if (x < 0 || y < 0 || x >= size || y >= size) return false;
  const cx = x < r ? r : x > size - 1 - r ? size - 1 - r : x;
  const cy = y < r ? r : y > size - 1 - r ? size - 1 - r : y;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r + 0.5;
}

/** 沿线段画带圆头的粗线，用抗锯齿（按覆盖度混合 alpha） */
function drawStroke(px, x1, y1, x2, y2, half, color) {
  const minX = Math.floor(Math.min(x1, x2) - half - 1);
  const maxX = Math.ceil(Math.max(x1, x2) + half + 1);
  const minY = Math.floor(Math.min(y1, y2) - half - 1);
  const maxY = Math.ceil(Math.max(y1, y2) + half + 1);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d = distToSegment(x + 0.5, y + 0.5, x1, y1, x2, y2);
      // 覆盖度：距离小于 half-0.5 全实，half+0.5 外全透，中间线性过渡
      const cov = clamp01(half + 0.5 - d);
      if (cov <= 0) continue;
      px(x, y, [color[0], color[1], color[2], Math.round(255 * cov)]);
    }
  }
}

function distToSegment(px_, py_, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px_ - x1) * dx + (py_ - y1) * dy) / len2;
  t = clamp01(t);
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px_ - cx, py_ - cy);
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ---------- 输出 ---------- */

const outDir = path.join(__dirname, '..', 'public');
const targets = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

for (const t of targets) {
  const rgba = draw(t.size);
  const png = encodePNG(t.size, t.size, rgba);
  const out = path.join(outDir, t.name);
  fs.writeFileSync(out, png);
  console.log(`  ✓ ${t.name}  ${t.size}x${t.size}  ${png.length} bytes`);
}
console.log('done');
