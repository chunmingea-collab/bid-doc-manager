// Generate a 552x68 BMP used by the NSIS installer header (custom branding
// strip that appears at the top of the install wizard).
//
// Why BMP? NSIS's installer header image format is BMP only — PNG won't be
// embedded. We generate it procedurally so we don't need a binary asset in
// the repo.

const fs = require("fs");
const path = require("path");

const W = 552;
const H = 68;
const out = path.join(__dirname, "..", "build", "installer-header.bmp");

const buf = Buffer.alloc(54 + W * H * 3);
// BITMAPFILEHEADER
buf.write("BM", 0);
buf.writeUInt32LE(54 + W * H * 3, 2); // file size
buf.writeUInt32LE(0, 6);
buf.writeUInt32LE(54, 10); // pixel offset
// BITMAPINFOHEADER
buf.writeUInt32LE(40, 14);
buf.writeInt32LE(W, 18);
buf.writeInt32LE(H, 22);
buf.writeUInt16LE(1, 26); // planes
buf.writeUInt16LE(24, 28); // bpp
buf.writeUInt32LE(0, 30); // no compression
buf.writeUInt32LE(W * H * 3, 34);
buf.writeInt32LE(2835, 38); // ~72 DPI
buf.writeInt32LE(2835, 42);

// Brand colors
const BRAND = [0x16, 0x77, 0xff]; // Antd blue #1677ff
const ACCENT = [0xff, 0xff, 0xff];

// Draw a left-to-right brand gradient (subtle darken) and a logo dot.
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    // vertical gradient: slightly darker at top
    const t = y / H;
    const r = Math.round(BRAND[0] * (1 - 0.18 * t));
    const g = Math.round(BRAND[1] * (1 - 0.18 * t));
    const b = Math.round(BRAND[2] * (1 - 0.18 * t));
    // BMP rows are bottom-up
    const row = H - 1 - y;
    const off = 54 + (row * W + x) * 3;
    buf[off] = b;
    buf[off + 1] = g;
    buf[off + 2] = r;
  }
}

// Draw a small white dot in the top-left as a logo placeholder.
const dotR = 14;
const dotCx = 34;
const dotCy = H / 2;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = x - dotCx;
    const dy = y - dotCy;
    if (dx * dx + dy * dy <= dotR * dotR) {
      const row = H - 1 - y;
      const off = 54 + (row * W + x) * 3;
      buf[off] = ACCENT[2];
      buf[off + 1] = ACCENT[1];
      buf[off + 2] = ACCENT[0];
    }
  }
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buf);
console.log(`Wrote ${out} (${W}x${H} 24-bit BMP, ${buf.length} bytes)`);
