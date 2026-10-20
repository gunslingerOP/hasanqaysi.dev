// diagram.ts — house figures from a JSON spec. Output is inline SVG that uses only the kit classes
// in /assets/field.css (no colours inside the SVG), so every figure follows light/dark and the palette.
// Pages that embed figures need the shared <svg class="d-defs"> block (arrowheads) — print it with
// `bun diagram.ts --defs`.
//
// usage: bun diagram.ts <spec.json> [out.html]      spec types: flow · sequence · fanin · stack
//        bun diagram.ts --defs                       prints the shared marker defs
// examples: tools/figures/*.json

type Kind = "" | "accent" | "ghost";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const textW = (s: string, px = 12) => s.length * px * 0.56;
const t = (cls: string, x: number, y: number, s: string, anchor = "start") =>
  `<text class="${cls}" x="${x}" y="${y}"${anchor !== "start" ? ` text-anchor="${anchor}"` : ""}>${esc(s)}</text>`;
const step = (x: number, y: number, n: number) =>
  `<g class="d-step"><rect x="${x}" y="${y}" width="18" height="18" rx="9"/>${t("d-step-num", x + 9, y + 12.5, String(n), "middle")}</g>`;
const node = (x: number, y: number, w: number, h: number, lines: string[], kind: Kind = "", small?: string, attrs = "") => {
  const first = y + h / 2 - ((lines.length - 1) * 14) / 2 + 4;
  return `<g class="d-node${kind ? " d-node--" + kind : ""}"${attrs}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>` +
    lines.map((l, i) => t("d-label", x + w / 2, first + i * 14, l, "middle")).join("") +
    (small ? t("d-label--small", x + w / 2, y + h - 7, small, "middle") : "") + `</g>`;
};
const edge = (d: string, mods: string[] = [], marker = "d-arrow", attrs = "") =>
  `<path class="d-edge${mods.map((m) => " d-edge--" + m).join("")}" d="${d}" marker-end="url(#${marker})"${attrs}/>`;
const say = (v?: string) => (v ? ` data-say="${esc(v).replace(/"/g, "&quot;")}"` : "");
const groupLabel = (x: number, y: number, s: string) =>
  `<rect class="d-label-bg" x="${x}" y="${y - 8}" width="${textW(s) + 12}" height="16"/>${t("d-group-label", x + 6, y + 3.5, s)}`;
const wrap = (id: string, box: string, title: string, desc: string, body: string, extra = "") =>
  `<svg class="diagram${extra}" viewBox="${box}" role="img" aria-labelledby="${id}-t ${id}-d"><title id="${id}-t">${esc(title)}</title><desc id="${id}-d">${esc(desc)}</desc>` +
  `<rect class="d-ground" x="-2000" y="-2000" width="5000" height="5000"/>${body}</svg>`;

export const DEFS = `<svg class="d-defs" aria-hidden="true" focusable="false"><defs>` +
  `<marker id="d-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="d-arrowhead" d="M0 0.5L10 5L0 9.5z"/></marker>` +
  `<marker id="d-arrow-accent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path class="d-arrowhead d-arrowhead--accent" d="M0 0.5L10 5L0 9.5z"/></marker>` +
  `<marker id="d-arrow-onaccent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="d-arrowhead--onaccent" d="M0 0.5L10 5L0 9.5z"/></marker>` +
  `</defs></svg>`;

interface FlowSpec { type: "flow"; id: string; title: string; desc: string; nodes: { label: string[]; kind?: Kind; say?: string }[];
  groups?: { from: number; to: number; label: string; labelAt?: "top" | "bottom" }[];
  branch?: { from: number; label: string; edge?: string; note?: string }; notes?: { text: string; under?: number }[]; caption?: string }
interface SeqSpec { type: "sequence"; id: string; title: string; desc: string; lanes: { name: string; kind?: Kind }[];
  messages: { from: number; to: number; label: string; kind?: "" | "dashed" | "accent"; say?: string }[]; notes?: { text: string[]; nearMessage: number }[]; footnote?: string }
interface FaninSpec { type: "fanin"; id: string; title: string; desc: string; group: string; inputs: { label: string; count?: string; say?: string }[];
  output: { label: string; small?: string; say?: string }; notes?: string[] }
interface StackSpec { type: "stack"; id: string; title: string; steps: { label: string; kind?: Kind }[]; onAccent?: boolean }
type Spec = FlowSpec | SeqSpec | FaninSpec | StackSpec;

export function flow(s: FlowSpec) {
  const nw = 112, nh = 56, gap = 24, y = 110, n = s.nodes.length;
  const W = 16 * 2 + n * nw + (n - 1) * gap;
  const xs = s.nodes.map((_, i) => 16 + i * (nw + gap));
  let b = "";
  for (const g of s.groups ?? []) {
    const x1 = xs[g.from] - 8, x2 = xs[g.to] + nw + 8, top = g.labelAt === "bottom" ? 96 : 78;
    b += `<g class="d-group"><rect x="${x1}" y="${top}" width="${x2 - x1}" height="${180 - top}" rx="12"/></g>`;
    b += g.labelAt === "bottom" ? groupLabel(x1 + 16, 180, g.label) : groupLabel(x1 + 12, top, g.label);
  }
  s.nodes.forEach((nd, i) => {
    b += node(xs[i], y, nw, nh, nd.label, nd.kind ?? "", undefined, ` data-step="${i + 1}"${say(nd.say)}`) + step(xs[i] - 6, y - 7, i + 1);
    if (i < n - 1) b += edge(`M${xs[i] + nw + 1} ${y + nh / 2}H${xs[i + 1] - 3}`, [], "d-arrow", ` data-edge="${i + 2}"`);
  });
  let H = 210;
  if (s.branch) {
    const cx = xs[s.branch.from] + nw / 2;
    b += edge(`M${cx} ${y + nh}V236`, ["dashed"], "d-arrow", ` data-with="${s.branch.from + 1}"`);
    if (s.branch.edge) b += t("d-label--small", cx + 8, 206, s.branch.edge);
    b += node(xs[s.branch.from], 240, nw, 40, [s.branch.label], "", undefined, ` data-with="${s.branch.from + 1}"`);
    if (s.branch.note) b += t("d-note", xs[s.branch.from] + nw + 14, 264, s.branch.note);
    H = 300;
  }
  (s.notes ?? []).forEach((nt, i) => {
    if (nt.under !== undefined) b += t("d-note", xs[nt.under] + nw / 2, 214, nt.text, "middle");
    else { H += 6; b += t("d-note", 16, H + 10, nt.text); H += 14; }
  });
  return wrap(s.id, `0 60 ${W} ${H - 60 + 20}`, s.title, s.desc, b);
}

export function sequence(s: SeqSpec) {
  const lanes = s.lanes, cx = lanes.map((_, i) => 76 + i * 136), W = 16 + lanes.length * 136;
  const bottom = 100 + (s.messages.length - 1) * 40 + 24;
  let b = "";
  lanes.forEach((l, i) => { b += `<line class="d-lane" x1="${cx[i]}" y1="58" x2="${cx[i]}" y2="${bottom}"/>` + node(cx[i] - 56, 16, 112, 40, [l.name], l.kind ?? ""); });
  s.messages.forEach((m, k) => {
    const y = 100 + k * 40, x1 = cx[m.from], x2 = cx[m.to], dir = Math.sign(x2 - x1), mid = (x1 + x2) / 2;
    b += `<g class="d-msg-g" data-step="${k + 1}"${say(m.say)}>` + edge(`M${x1 + dir * 2} ${y}H${x2 - dir * 4}`, m.kind ? [m.kind] : [], "d-arrow", ` data-edge="${k + 1}"`);
    b += t("d-msg", mid + 12, y - 7, m.label, "middle") + step(mid + 12 - textW(m.label) / 2 - 24, y - 21, k + 1) + `</g>`;
  });
  for (const nt of s.notes ?? []) {
    const m = s.messages[nt.nearMessage], x = Math.max(cx[m.from], cx[m.to]) + 12, y = 100 + nt.nearMessage * 40 - 16;
    nt.text.forEach((line, i) => { b += t("d-note", x, y + i * 16, line); });
  }
  let H = bottom + 16;
  if (s.footnote) { b += t("d-note", 16, H + 12, s.footnote); H += 24; }
  return wrap(s.id, `0 0 ${W} ${H}`, s.title, s.desc, b);
}

export function fanin(s: FaninSpec) {
  const n = s.inputs.length, H = 32 + n * 52 + 30, cy = 32 + ((n - 1) * 52) / 2 + 18;
  let b = `<g class="d-group"><rect x="8" y="14" width="292" height="${n * 52 + 22}" rx="12"/></g>` + groupLabel(20, 14, s.group);
  s.inputs.forEach((inp, i) => {
    const y = 32 + i * 52;
    b += `<g class="d-node" data-step="${i + 1}"${say(inp.say)}><rect x="20" y="${y}" width="268" height="36" rx="10"/>${t("d-string", 32, y + 22, inp.label)}${inp.count ? t("d-label--small", 278, y + 22, inp.count, "end") : ""}</g>`;
    b += `<path class="d-edge" d="M289 ${y + 18}H468V${cy}H620" marker-end="url(#d-arrow)" data-edge="${n + 1}"/>`;
  });
  b += node(624, cy - 32, 300, 64, [s.output.label], "accent", s.output.small, ` data-step="${n + 1}"${say(s.output.say)}`);
  if (s.notes?.[0]) b += t("d-note", 478, Math.max(26, cy - 54), s.notes[0]);
  if (s.notes?.[1]) b += t("d-note", 624, cy + 58, s.notes[1]);
  return wrap(s.id, `0 0 960 ${Math.max(H, cy + 80)}`, s.title, s.desc, b);
}

export function stack(s: StackSpec) {
  const nw = 236, nh = 36, gap = 16, x = 32, H = 24 + s.steps.length * (nh + gap);
  let b = "";
  s.steps.forEach((st, i) => {
    const y = 16 + i * (nh + gap);
    b += node(x, y, nw, nh, [st.label], st.kind ?? "");
    if (i < s.steps.length - 1) b += edge(`M${x + nw / 2} ${y + nh + 1}V${y + nh + gap - 3}`, [], s.onAccent ? "d-arrow-onaccent" : "d-arrow");
  });
  return `<svg class="diagram${s.onAccent ? " diagram--onaccent" : ""}" viewBox="0 0 300 ${H}" role="img" aria-labelledby="${s.id}-t"><title id="${s.id}-t">${esc(s.title)}</title>${b}</svg>`;
}

export function render(spec: Spec) {
  switch (spec.type) {
    case "flow": return flow(spec);
    case "sequence": return sequence(spec);
    case "fanin": return fanin(spec);
    case "stack": return stack(spec);
  }
}

if (import.meta.main) {
  const [a, out] = process.argv.slice(2);
  if (a === "--defs") { console.log(DEFS); process.exit(0); }
  if (!a) { console.error("usage: bun diagram.ts <spec.json> [out.html] | --defs"); process.exit(2); }
  const html = render(JSON.parse(await Bun.file(a).text()));
  if (/#[0-9a-fA-F]{3,6}\b/.test(html)) { console.error("refusing: a hex colour leaked into the SVG"); process.exit(1); }
  if (out) await Bun.write(out, html); else console.log(html);
}
