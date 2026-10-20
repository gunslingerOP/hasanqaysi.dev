// dither.ts — run any image (a photo, a screenshot, a render) through a house treatment.
// The treatments live in tools/lib/raster.ts: dots (1-bit printer), lines (engraved), atkinson (soft).
// usage: bun dither.ts <in> <out.png> [--method dots|lines|atkinson] [--width 720] [--dot 2]
//                      [--threshold 0.5] [--contrast 1.15] [--invert] [--preview preview.png]
import { rasterize, preview, type Method } from "./lib/raster.ts";

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const positional = args.filter((a, i) => !a.startsWith("--") && !(args[i - 1] ?? "").startsWith("--"));
const [input, output] = positional;
if (!input || !output) {
  console.error("usage: bun dither.ts <in> <out.png> [--method dots|lines|atkinson] [--width 720] [--dot 2] [--threshold 0.5] [--contrast 1.15] [--invert] [--preview p.png]");
  process.exit(2);
}
const method = (opt("method") === "bayer" ? "dots" : opt("method") ?? "dots") as Method;
const r = await rasterize(input, {
  method, width: Number(opt("width") ?? 720), dot: Number(opt("dot") ?? (method === "lines" ? 2 : 3)),
  threshold: Number(opt("threshold") ?? 0.5), contrast: Number(opt("contrast") ?? 1.15), invert: args.includes("--invert"),
});
await Bun.write(output, r.png);
if (opt("preview")) await Bun.write(opt("preview")!, await preview(r.png));
console.log(JSON.stringify({ out: output, width: r.width, height: r.height, method, coverage: r.coverage }));
