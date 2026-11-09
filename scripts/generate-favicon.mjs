// Generates public/favicon.ico + public/favicon.png from the same hand-drawn pixel model.
// Pure Node (zlib only) so it runs in CI without image tooling.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const S = 256;
const img = new Uint8Array(S * S * 4); // RGBA

function setPx(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  img[i] = r; img[i + 1] = g; img[i + 2] = b; img[i + 3] = a;
}

function blendPx(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || y >= S || x >= S || a <= 0) return;
  const i = (y * S + x) * 4;
  const ea = img[i + 3] / 255;
  const na = a / 255 + ea * (1 - a / 255);
  if (na <= 0) return;
  img[i] = Math.round((r * (a / 255) + img[i] * ea * (1 - a / 255)) / na);
  img[i + 1] = Math.round((g * (a / 255) + img[i + 1] * ea * (1 - a / 255)) / na);
  img[i + 2] = Math.round((b * (a / 255) + img[i + 2] * ea * (1 - a / 255)) / na);
  img[i + 3] = Math.round(na * 255);
}

// colors
const BG1 = [11, 20, 26]; // #0B141A
const BG2 = [7, 94, 84]; // #075E54
const GRN1 = [37, 211, 102]; // #25D366
const GRN2 = [18, 140, 126]; // #128C7E

function lerp(a, b, t) { return a + (b - a) * t; }

// pass 1: background rounded square with diagonal gradient
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const r = 32;
  const dx = Math.max(r - x, 0, x - (S - r));
  const dy = Math.max(r - y, 0, y - (S - r));
  const d = Math.hypot(dx, dy);
  let alpha = d <= r ? 255 : Math.max(0, Math.min(255, 255 - (d - r) * 4));
  if (alpha <= 0) continue;
  const t = (x + y) / (2 * S);
  blendPx(x, y, lerp(BG1[0], BG2[0], t), lerp(BG1[1], BG2[1], t), lerp(BG1[2], BG2[2], t), alpha);
}

// chat bubble: rounded ellipse + tail (approximated with signed distance)
function bubbleInside(x, y) {
  const cx = S / 2, cy = S * 0.475, rx = S * 0.33, ry = S * 0.30;
  const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
  // tail: triangle bottom-left from bubble toward (S*0.20, S*0.80)
  const inTail = x < S * 0.42 && y > S * 0.62 && (y - S * 0.62) < (x - S * 0.12) * 0.9 && x > S * 0.08;
  return e <= 1 || inTail;
}

for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  if (!bubbleInside(x, y)) continue;
  const cy = S * 0.475;
  const t = Math.min(1, Math.max(0, (y - S * 0.18) / (S * 0.6)));
  // smooth edge via 1px anti-alias using neighbor check
  const soft = bubbleInside(x + 1, y) && bubbleInside(x, y + 1) && bubbleInside(x - 1, y) && bubbleInside(x, y - 1) ? 255 : 200;
  blendPx(x, y, lerp(GRN1[0], GRN2[0], t), lerp(GRN1[1], GRN2[1], t), lerp(GRN1[2], GRN2[2], t), soft);
  void cy;
}

function circle(cx, cy, r, rgb, alpha = 255) {
  for (let y = Math.floor(cy - r - 1); y < Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x < Math.ceil(cx + r + 1); x++) {
      const d = Math.hypot(x - cx, y - cy);
      const a = d <= r - 1 ? alpha : alpha * Math.max(0, 1 - (d - (r - 1)));
      if (a > 0) blendPx(x, y, rgb[0], rgb[1], rgb[2], Math.min(255, a));
    }
  }
}

const cyN = S * 0.47;
circle(S * 0.50, cyN, S * 0.078, [255, 255, 255]);
circle(S * 0.335, cyN, S * 0.050, [255, 255, 255], 230);
circle(S * 0.665, cyN, S * 0.050, [255, 255, 255], 230);
circle(S * 0.50, cyN, S * 0.031, BG2);
circle(S * 0.50, cyN, S * 0.008, [255, 255, 255]);

// Encode PNG
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function encodePng() {
  const raw = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0;
    Buffer.from(img.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

const png = encodePng();
writeFileSync(new URL("../public/favicon.png", import.meta.url), png);

// ICO with a single 256x256 PNG entry (valid ICO in all modern browsers)
const ico = Buffer.alloc(6 + 16 + png.length);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico[6] = 0; ico[7] = 0; ico[8] = 0; ico[9] = 0; ico[10] = 1; ico[11] = 0;
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
png.copy(ico, 22);
writeFileSync(new URL("../public/favicon.ico", import.meta.url), ico);

console.log(`[favicon] wrote public/favicon.ico (${ico.length}b) and public/favicon.png (${png.length}b)`);
