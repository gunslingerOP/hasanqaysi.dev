// raster.ts — the house image treatments, as a library.
// Turns any image into a 1-bit alpha mask (ink opaque, paper transparent) so a page can print it
// through CSS `mask` in a colour token, and it re-themes with light/dark for free.
//   dots  — 8×8 ordered (Bayer) dither: the 1-bit printer look (blue portrait pin, brochure sphere)
//   lines — vertical engraved strokes whose width follows tone (the ink-line pin)
//   atkinson — error-diffused dots, softer, for photographs
import sharp from "sharp";

export type Method = "dots" | "lines" | "atkinson";
export interface RasterOptions {
  width?: number;      // final PNG width in px (render at ~2× the CSS display width)
  dot?: number;        // size of one cell in px (2–3 reads as print at 2× DPR)
  threshold?: number;  // 0–1, higher = more ink
  contrast?: number;   // tonal contrast before rasterising
  method?: Method;
  invert?: boolean;
}
export interface RasterResult { png: Buffer; width: number; height: number; coverage: number }

const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
];

export async function rasterize(input: string | Buffer, o: RasterOptions = {}): Promise<RasterResult> {
  const width = o.width ?? 720, dot = Math.max(1, Math.round(o.dot ?? 2)), threshold = o.threshold ?? 0.5;
  const contrast = o.contrast ?? 1.15, method: Method = o.method ?? "dots", invert = !!o.invert;
  const cellW = Math.max(1, Math.round(width / dot));
  const { data, info } = await sharp(input).rotate().flatten({ background: "#ffffff" }).resize({ width: cellW }).greyscale().normalise().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = Math.min(1, Math.max(0, (data[i * info.channels] / 255 - 0.5) * contrast + 0.5));

  const ink = new Uint8Array(W * H);
  if (method === "atkinson") {
    const buf = Float32Array.from(lum), cut = 1 - threshold;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, old = buf[i], val = old < cut ? 0 : 1;
      ink[i] = val === 0 ? 1 : 0;
      const err = (old - val) / 8;
      for (const [dx, dy] of [[1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < W && ny < H) buf[ny * W + nx] += err;
      }
    }
  } else if (method === "dots") {
    const bias = threshold - 0.5;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ink[y * W + x] = lum[y * W + x] < (BAYER[y % 8][x % 8] + 0.5) / 64 + bias ? 1 : 0;
  }
  if (invert && method !== "lines") for (let i = 0; i < ink.length; i++) ink[i] ^= 1;

  const OW = W * dot, OH = H * dot, out = Buffer.alloc(OW * OH * 2);
  let inked = 0;
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
    let on: number;
    if (method === "lines") {
      const period = dot * 4, col = Math.floor(x / period), cx = col * period + period / 2;
      const cell = Math.min(W - 1, Math.floor((col * period + period / 2) / dot));
      const tone = 1 - lum[Math.floor(y / dot) * W + cell];
      const dark = invert ? 1 - tone : tone;
      const half = Math.max(0.5, dark * period * 0.46 * (0.6 + threshold * 0.8));
      on = dark > 0.02 && Math.abs(x + 0.5 - cx) < Math.min(half, period * 0.42) ? 1 : 0;
    } else on = ink[Math.floor(y / dot) * W + Math.floor(x / dot)];
    const k = (y * OW + x) * 2;
    out[k] = 0; out[k + 1] = on ? 255 : 0; inked += on;
  }
  const png = await sharp(out, { raw: { width: OW, height: OH, channels: 2 } }).png({ compressionLevel: 9 }).toBuffer();
  return { png, width: OW, height: OH, coverage: +(inked / (OW * OH)).toFixed(3) };
}

/** Composite a mask onto solid colours for previews (never used on the site itself). */
export async function preview(mask: Buffer, ink = "#000000", paper = "#B0E0E6"): Promise<Buffer> {
  const { width = 0, height = 0 } = await sharp(mask).metadata();
  const alpha = await sharp(mask).ensureAlpha().extractChannel(3).toBuffer();
  const inkLayer = await sharp({ create: { width, height, channels: 3, background: ink } }).joinChannel(alpha).png().toBuffer();
  return sharp({ create: { width, height, channels: 3, background: paper } }).composite([{ input: inkLayer }]).png().toBuffer();
}
