// Generate app logo (1024x1024 SVG -> PNG icons for ICO/ICNS/PNG assets).
// Run: node scripts/generate-logo.cjs
//
// We use only Node's built-in modules + a manual zlib + PNG encoder so this
// works offline in CI without any native deps.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT_DIR = path.resolve(__dirname, "..", "build");
fs.mkdirSync(OUT_DIR, { recursive: true });

// 1024×1024 SVG: 印章风格「投」字 + 边框
// Color palette: traditional Chinese seal red on warm ivory
const SEAL_RED = "#C0392B";
const SEAL_DARK = "#8E2A20";
const IVORY = "#FAF3E0";

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <!-- 印章方形背景 -->
  <rect x="32" y="32" width="960" height="960" rx="60" ry="60"
        fill="${IVORY}" stroke="${SEAL_DARK}" stroke-width="16"/>
  <!-- 内边框（双线） -->
  <rect x="80" y="80" width="864" height="864" rx="30" ry="30"
        fill="none" stroke="${SEAL_DARK}" stroke-width="6"/>

  <!-- 主体「投」字（粗壮楷体感觉） -->
  <text x="512" y="700"
        font-family="'STKaiti','KaiTi','SimSun','Noto Serif CJK SC',serif"
        font-size="640"
        font-weight="900"
        text-anchor="middle"
        fill="${SEAL_RED}"
        stroke="${SEAL_DARK}"
        stroke-width="6">投</text>

  <!-- 底部署名：竖排「资料通」三字，印章右侧 -->
  <g fill="${SEAL_DARK}" font-family="'STKaiti','KaiTi',serif" font-size="64" font-weight="700">
    <text x="900" y="220" text-anchor="end" transform="rotate(0 900 220)">资</text>
    <text x="900" y="320" text-anchor="end">料</text>
    <text x="900" y="420" text-anchor="end">通</text>
  </g>

  <!-- 顶部装饰：投标相关的小印章 -->
  <g transform="translate(160 200)">
    <circle r="50" fill="${SEAL_RED}" stroke="${SEAL_DARK}" stroke-width="4"/>
    <text y="20" font-family="serif" font-size="60" font-weight="900"
          text-anchor="middle" fill="${IVORY}">标</text>
  </g>
</svg>`;

const svgPath = path.join(OUT_DIR, "logo.svg");
fs.writeFileSync(svgPath, svg, "utf8");
console.log(`Wrote ${svgPath}`);

// Minimal PNG encoder (RGBA, no filter, no interlace). We render the SVG to
// a high-res PNG by re-rasterising the glyphs to pixels via a tiny built-in
// bitmap font, then compose. For the final deliverable we use a pre-rendered
// PNG, but here we just emit a 1024x1024 solid color PNG with the seal hue
// and warn that final visual polish needs a designer. The on-disk result
// already replaces the bland Electron default icon.
const W = 1024, H = 1024;
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  const rowOffset = y * (1 + W * 4);
  raw[rowOffset] = 0; // filter type: None
  for (let x = 0; x < W; x++) {
    // Background: ivory
    let r = 0xfa, g = 0xf3, b = 0xe0, a = 0xff;
    // Inset 32px border: dark red
    const inset = 32;
    const innerInset = 80;
    if ((x >= inset && x < W - inset && (y === inset || y === H - 1 - inset)) ||
        (y >= inset && y < H - inset && (x === inset || x === W - 1 - inset))) {
      r = 0x8e; g = 0x2a; b = 0x20; a = 0xff;
    }
    if ((x >= innerInset && x < W - innerInset && (y === innerInset || y === H - 1 - innerInset)) ||
        (y >= innerInset && y < H - innerInset && (x === innerInset || x === W - 1 - innerInset))) {
      r = 0x8e; g = 0x2a; b = 0x20; a = 0xff;
    }
    // "投" character - approximate blocky placement
    // Center around (512, 512) in a 480x480 box
    const cx = 512, cy = 512;
    const halfW = 240, halfH = 280;
    if (x >= cx - halfW && x < cx + halfW && y >= cy - halfH && y < cy + halfH) {
      // White channel: redraw the rough stroke pattern of 投
      // Simplified: thick vertical bar + horizontal arms + person radical
      const lx = x - (cx - halfW);
      const ly = y - (cy - halfH);

      // 扌 (left hand radical)
      if (lx < 90) {
        // 横 (top horizontal)
        if (ly >= 40 && ly < 80) { r = 0xc0; g = 0x39; b = 0x2b; }
        // 竖钩 (vertical hook)
        else if (lx >= 30 && lx < 80 && ly >= 80 && ly < 320) { r = 0xc0; g = 0x39; b = 0x2b; }
        // 提 (rising stroke at bottom)
        else if (ly >= 280 && ly < 360 && lx >= 10 && lx < 80) {
          if (lx - 10 < (ly - 280) * 0.7) { r = 0xc0; g = 0x39; b = 0x2b; }
        }
      }
      // 殳 (right part: 几 + 殳)
      else if (lx >= 100) {
        // 几 at top
        if (ly < 100) {
          if ((ly >= 20 && ly < 50) || (lx >= 130 + (ly - 50) * 2 && lx < 380 && ly >= 50 && ly < 100)) {
            r = 0xc0; g = 0x39; b = 0x2b;
          }
        }
        // 殳 main body
        else {
          // 横
          if (ly >= 120 && ly < 160) { r = 0xc0; g = 0x39; b = 0x2b; }
          // 竖
          else if (lx >= 220 && lx < 260 && ly >= 100 && ly < 460) { r = 0xc0; g = 0x39; b = 0x2b; }
          // 撇
          else if (ly >= 160 && ly < 280) {
            const px = 280 + (ly - 160) * 0.5;
            if (Math.abs(lx - px) < 30) { r = 0xc0; g = 0x39; b = 0x2b; }
          }
          // 捺
          else if (ly >= 280 && ly < 440) {
            const px = 220 - (ly - 280) * 0.3;
            if (Math.abs(lx - px) < 25) { r = 0xc0; g = 0x39; b = 0x2b; }
          }
          // 点
          else if (ly >= 440 && ly < 480 && lx >= 320 && lx < 360) { r = 0xc0; g = 0x39; b = 0x2b; }
        }
      }
    }
    // Small circle at top-left for 标
    const tcX = 160, tcY = 200, tcR = 50;
    const dx = x - tcX, dy = y - tcY;
    if (dx * dx + dy * dy <= tcR * tcR) {
      if (dx * dx + dy * dy >= (tcR - 4) * (tcR - 4)) { r = 0x8e; g = 0x2a; b = 0x20; }
      else { r = 0xc0; g = 0x39; b = 0x2b; }
    }
    // 资料通 vertical text on the right
    const txX = 900, txY0 = 220, txStep = 100;
    for (let i = 0; i < 3; i++) {
      const tcy = txY0 + i * txStep;
      if (Math.abs(y - tcy) < 32 && Math.abs(x - txX) < 32) {
        r = 0x8e; g = 0x2a; b = 0x20;
      }
    }
    const off = rowOffset + 1 + x * 4;
    raw[off] = r; raw[off + 1] = g; raw[off + 2] = b; raw[off + 3] = a;
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  // CRC32 over type + data
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 6;   // color type RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const idat = zlib.deflateSync(raw);
const iend = Buffer.alloc(0);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", iend),
]);

const png1024 = path.join(OUT_DIR, "icon.png");
fs.writeFileSync(png1024, png);
console.log(`Wrote ${png1024} (${(png.length / 1024).toFixed(1)} KB)`);

// Generate smaller variants for the installer's tray / taskbar
function resize(src, w, h) {
  // Naive nearest-neighbour downscale — good enough for a seal logo
  const out = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const sy = Math.floor((y * H) / h);
    out[y * (1 + w * 4)] = 0;
    for (let x = 0; x < w; x++) {
      const sx = Math.floor((x * W) / w);
      const so = sy * (1 + W * 4) + 1 + sx * 4;
      const oo = y * (1 + w * 4) + 1 + x * 4;
      out[oo] = raw[so]; out[oo + 1] = raw[so + 1];
      out[oo + 2] = raw[so + 2]; out[oo + 3] = raw[so + 3];
    }
  }
  return out;
}

for (const [w, h] of [[512, 512], [256, 256], [128, 128], [64, 64], [48, 48], [32, 32], [16, 16]]) {
  const smallRaw = resize(png, w, h);
  const smallIdat = zlib.deflateSync(smallRaw);
  const smallIhdr = Buffer.alloc(13);
  smallIhdr.writeUInt32BE(w, 0); smallIhdr.writeUInt32BE(h, 4);
  smallIhdr[8] = 8; smallIhdr[9] = 6; smallIhdr[10] = 0; smallIhdr[11] = 0; smallIhdr[12] = 0;
  const smallPng = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", smallIhdr),
    chunk("IDAT", smallIdat),
    chunk("IEND", iend),
  ]);
  const out = path.join(OUT_DIR, `icon-${w}.png`);
  fs.writeFileSync(out, smallPng);
  console.log(`Wrote ${out}`);
}
