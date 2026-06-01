// Pack the 16/32/48/64/128/256 PNGs into a single multi-resolution ICO.
// electron-builder requires a real ICO for Windows installer assets.

const fs = require("fs");
const path = require("path");

const BUILD = path.resolve(__dirname, "..", "build");
const SIZES = [16, 32, 48, 64, 128, 256];

const images = SIZES.map((s) => {
  const p = path.join(BUILD, `icon-${s}.png`);
  return { size: s, data: fs.readFileSync(p) };
});

const ICONDIR_SIZE = 6;
const ENTRY_SIZE = 16;
const headerSize = ICONDIR_SIZE + ENTRY_SIZE * images.length;
const offsets = [];
let acc = headerSize;
for (const img of images) {
  offsets.push(acc);
  acc += img.data.length;
}

const buf = Buffer.alloc(acc);
let p = 0;
buf.writeUInt16LE(0, p); p += 2;       // reserved
buf.writeUInt16LE(1, p); p += 2;       // type: 1 = icon
buf.writeUInt16LE(images.length, p); p += 2;

for (let i = 0; i < images.length; i++) {
  const img = images[i];
  const off = offsets[i];
  buf.writeUInt8(img.size === 256 ? 0 : img.size, p); p += 1;   // width (0 = 256)
  buf.writeUInt8(img.size === 256 ? 0 : img.size, p); p += 1;   // height
  buf.writeUInt8(0, p); p += 1;                                 // color count
  buf.writeUInt8(0, p); p += 1;                                 // reserved
  buf.writeUInt16LE(1, p); p += 2;                              // planes
  buf.writeUInt16LE(32, p); p += 2;                             // bit count
  buf.writeUInt32LE(img.data.length, p); p += 4;                // bytes in res
  buf.writeUInt32LE(off, p); p += 4;                            // image offset
  img.data.copy(buf, off);
}

const out = path.join(BUILD, "icon.ico");
fs.writeFileSync(out, buf);
console.log(`Wrote ${out} (${(buf.length / 1024).toFixed(1)} KB, ${SIZES.length} sizes)`);
