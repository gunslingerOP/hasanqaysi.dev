// contrast.ts — the colour gate for /assets/field.css. Reads the real tokens (light-dark pairs),
// checks WCAG contrast for every pairing the system allows, checks the palette rules, exits 1 on any fail.
// usage: bun contrast.ts [path/to/field.css]
const file = process.argv[2] ?? new URL("../assets/field.css", import.meta.url).pathname;
const css = await Bun.file(file).text();
const block = css.slice(css.indexOf("/* tokens:color"), css.indexOf("/* /tokens:color */"));
if (!block) { console.error("tokens:color block not found"); process.exit(2); }

const tokens: Record<string, { light: string; dark: string }> = {};
for (const m of block.matchAll(/--([a-z0-9-]+):\s*light-dark\((#[0-9a-fA-F]{6}),\s*(#[0-9a-fA-F]{6})\)/g)) {
  tokens[m[1]] = { light: m[2].toUpperCase(), dark: m[3].toUpperCase() };
}

const lin = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const L = (hex: string) => { const [r, g, b] = rgb(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: string, b: string) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hue = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => v / 255); const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return null;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
};
const sat = (hex: string) => { const [r, g, b] = rgb(hex).map((v) => v / 255); const max = Math.max(r, g, b), min = Math.min(r, g, b); return max === 0 ? 0 : (max - min) / max; };

// fg, bg, minimum ratio, why
const pairs: [string, string, number, string][] = [
  ["text", "bg", 7, "body text on page"], ["text", "surface", 7, "body text on cards"],
  ["text-2", "bg", 4.5, "secondary text on page"], ["text-2", "surface", 4.5, "secondary text on cards"],
  ["text-3", "bg", 4.5, "tertiary text on page"], ["text-3", "surface", 4.5, "tertiary text on cards"], ["text-3", "surface-2", 4.5, "tertiary text on code/callouts"],
  ["link", "bg", 4.5, "links on page"], ["link", "surface", 4.5, "links on cards"],
  ["on-accent", "accent", 4.5, "text on powder-blue fields"],
  ["accent-ink", "surface", 4.5, "code strings on cards"], ["accent-ink", "surface-2", 4.5, "code strings on code blocks"],
  ["text", "sky", 7, "body text under the sky"], ["text-2", "sky", 4.5, "secondary text under the sky"], ["text-3", "sky", 4.5, "tertiary text under the sky"], ["link", "sky", 4.5, "links under the sky"],
  ["focus", "bg", 3, "focus ring (non-text)"], ["mark", "surface", 3, "chart highlight mark"], ["mark-2", "surface", 3, "chart context mark"],
];

let fails = 0;
const rows: string[] = [];
for (const mode of ["light", "dark"] as const) {
  for (const [fg, bg, min, why] of pairs) {
    if (!tokens[fg] || !tokens[bg]) { rows.push(`MISSING ${mode} ${fg}/${bg}`); fails++; continue; }
    const r = ratio(tokens[fg][mode], tokens[bg][mode]);
    const ok = r >= min; if (!ok) fails++;
    rows.push(`${ok ? "PASS" : "FAIL"}  ${mode.padEnd(5)} ${fg.padEnd(10)} on ${bg.padEnd(9)} ${r.toFixed(2).padStart(5)}:1  (min ${min}) — ${why}`);
  }
}

// palette rules: the four named colours, no purple, no stock Tailwind hexes, no third hue family
const all = Object.values(tokens).flatMap((t) => [t.light, t.dark]);
const purple = all.filter((h) => { const x = hue(h); return x !== null && sat(h) > 0.12 && x >= 250 && x <= 330; });
const STOCK = new Set(["#3B82F6", "#2563EB", "#1D4ED8", "#1E40AF", "#60A5FA", "#93C5FD", "#6366F1", "#4F46E5", "#4338CA", "#818CF8", "#A5B4FC", "#8B5CF6", "#7C3AED", "#A855F7", "#38BDF8", "#0EA5E9", "#0284C7", "#22D3EE", "#06B6D4", "#34D399", "#10B981", "#F8FAFC", "#F1F5F9", "#E2E8F0", "#CBD5E1", "#94A3B8", "#64748B", "#475569", "#334155", "#1E293B", "#0F172A", "#F3F4F6", "#E5E7EB", "#D1D5DB", "#9CA3AF", "#6B7280", "#4B5563", "#374151", "#1F2937", "#111827", "#F5F5F4", "#E7E5E4", "#D6D3D1", "#A8A29E", "#78716C", "#57534E", "#44403C", "#292524", "#1C1917", "#F4F4F5", "#E4E4E7", "#A1A1AA", "#71717A", "#52525B", "#3F3F46", "#27272A", "#18181B"]);
const stock = all.filter((h) => STOCK.has(h));
const chromatic = [...new Set(all.filter((h) => sat(h) > 0.12).map((h) => Math.round((hue(h) ?? 0) / 10) * 10))];
const accentHue = hue(tokens.accent.light);
const grayHue = hue(tokens.bg.light);
const ruleRows = [
  [tokens.accent.light === "#B0E0E6", `accent is powder blue (#B0E0E6): ${tokens.accent.light}`],
  [tokens.bg.light === "#D1CBC1", `light ground is Agreeable Gray (#D1CBC1): ${tokens.bg.light}`],
  [tokens.text.light === "#000000" && tokens.text.dark === "#FFFFFF" && tokens.bg.dark !== "#000000" && L(tokens.bg.dark) < 0.01, `black and white carry text; the dark ground is a near-black, not pure black: ${tokens.bg.dark}`],
  [purple.length === 0, `no purple tokens: ${purple.join(", ") || "none"}`],
  [stock.length === 0, `no stock Tailwind hexes: ${stock.join(", ") || "none"}`],
  [chromatic.every((h) => [accentHue ?? 0, grayHue ?? 0].some((fam) => Math.abs(h - fam) <= 12)), `only two hue families: Agreeable Gray (≈${grayHue?.toFixed(0)}°, its deep text shades included) and powder blue (≈${accentHue?.toFixed(0)}°) — found ${chromatic.join("°, ")}°`],
] as const;
for (const [ok, msg] of ruleRows) { rows.push(`${ok ? "PASS" : "FAIL"}  rule  ${msg}`); if (!ok) fails++; }

console.log(rows.join("\n"));
console.log(fails ? `\n${fails} check(s) failed` : `\nall ${rows.length} checks pass`);
process.exit(fails ? 1 : 0);
