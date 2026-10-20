// plate.ts — house artwork from primitives: one object, lit from the upper left, sitting on its
// shadow, printed in dots or engraved lines. The vocabulary comes from the boards: the brochure's
// sphere, the one-bit portrait, the ink-line mountain, the axes plate. Never places or landscapes.
//
// usage: bun plate.ts <shape> <out.png> [--style dots|lines] [--width 720] [--preview p.png]
//        bun plate.ts all <outdir> [--style dots|lines]        (renders every shape)
// shapes: sphere · cube · cylinder · stack · ring · cone
import { rasterize, preview } from "./lib/raster.ts";

const g = (id: string, cx: number, cy: number, r: number, stops: [number, number][]) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, v]) => `<stop offset="${o}" stop-color="rgb(${v},${v},${v})"/>`).join("")}</radialGradient>`;
const lg = (id: string, stops: [number, number][], x2 = 1, y2 = 0) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, v]) => `<stop offset="${o}" stop-color="rgb(${v},${v},${v})"/>`).join("")}</linearGradient>`;
const shadow = (cx = 470, cy = 800, rx = 300, ry = 40) =>
  `${g("sh", 0.5, 0.5, 0.5, [[0, 70], [1, 255]])}`.replace("radialGradient", "radialGradient") + `</defs><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#sh)"/>`;
const svg = (defs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900"><rect width="900" height="900" fill="white"/><defs>${defs}${body}</svg>`;

const SHAPES: Record<string, () => string> = {
  sphere: () => svg(g("b", 0.36, 0.32, 0.78, [[0, 255], [0.35, 170], [0.8, 50], [1, 25]]), shadow() + `<circle cx="450" cy="430" r="330" fill="url(#b)"/>`),
  cube: () => svg("", shadow(470, 790, 320, 44) + `<polygon points="450,150 730,300 450,450 170,300" fill="rgb(200,200,200)"/><polygon points="170,300 450,450 450,760 170,610" fill="rgb(140,140,140)"/><polygon points="450,450 730,300 730,610 450,760" fill="rgb(70,70,70)"/>`),
  cylinder: () => svg(lg("c", [[0, 200], [0.35, 235], [0.75, 90], [1, 50]]), shadow(460, 805, 280, 40) + `<rect x="210" y="210" width="480" height="520" fill="url(#c)"/><ellipse cx="450" cy="730" rx="240" ry="70" fill="url(#c)"/><ellipse cx="450" cy="210" rx="240" ry="70" fill="rgb(215,215,215)"/>`),
  stack: () => svg("", shadow(470, 810, 330, 42) + [0, 1, 2].map((i) => {
    const y = 560 - i * 170;
    return `<polygon points="450,${y - 120} 760,${y} 450,${y + 120} 140,${y}" fill="rgb(${205 - i * 10},${205 - i * 10},${205 - i * 10})"/><polygon points="140,${y} 450,${y + 120} 450,${y + 180} 140,${y + 60}" fill="rgb(135,135,135)"/><polygon points="450,${y + 120} 760,${y} 760,${y + 60} 450,${y + 180}" fill="rgb(70,70,70)"/>`;
  }).join("")),
  ring: () => svg(g("r", 0.4, 0.35, 0.7, [[0, 245], [0.5, 150], [1, 40]]), shadow(460, 800, 300, 40) + `<ellipse cx="450" cy="440" rx="330" ry="250" fill="url(#r)"/><ellipse cx="450" cy="420" rx="170" ry="110" fill="white"/><ellipse cx="450" cy="440" rx="170" ry="110" fill="none" stroke="rgb(60,60,60)" stroke-width="16" opacity="0.6"/>`),
  cone: () => svg(lg("k", [[0, 220], [0.45, 245], [0.8, 90], [1, 45]]), shadow(460, 790, 290, 40) + `<polygon points="450,120 720,720 180,720" fill="url(#k)"/><ellipse cx="450" cy="720" rx="270" ry="60" fill="url(#k)"/>`),
};

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const [shape, out] = args.filter((a, i) => !a.startsWith("--") && !(args[i - 1] ?? "").startsWith("--"));
if (!shape || !out || (shape !== "all" && !SHAPES[shape])) {
  console.error(`usage: bun plate.ts <${Object.keys(SHAPES).join("|")}|all> <out.png|outdir> [--style dots|lines] [--width 720] [--preview p.png]`);
  process.exit(2);
}
const style = opt("style") === "lines" ? "lines" : "dots";
const width = Number(opt("width") ?? 720);
const render = async (name: string, file: string) => {
  const r = await rasterize(Buffer.from(SHAPES[name]()), style === "lines"
    ? { method: "lines", width, dot: 2, threshold: 0.5, contrast: 1.05 }
    : { method: "dots", width, dot: 3, threshold: 0.5, contrast: 1.1 });
  await Bun.write(file, r.png);
  return { name, file, coverage: r.coverage };
};
if (shape === "all") {
  const results = await Promise.all(Object.keys(SHAPES).map((n) => render(n, `${out}/${n}-${style}.png`)));
  console.log(JSON.stringify(results));
} else {
  const r = await render(shape, out);
  if (opt("preview")) await Bun.write(opt("preview")!, await preview(await Bun.file(out).arrayBuffer().then((b) => Buffer.from(b))));
  console.log(JSON.stringify(r));
}
