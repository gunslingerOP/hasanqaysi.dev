// card.ts — a social/OG card for every post, in the house style: Agreeable Gray (or black),
// a Newsreader title, a powder-blue field holding a plate, and a glass capsule with the domain.
// Renders with headless Chrome in a throwaway profile; nothing touches your browser.
//
// usage: bun card.ts --title "One asset, ten names" --kicker "Breakdown · July 2026"
//                    --plate assets/img/plates/sphere-dots.png --out card.png [--theme light|dark]
import { join, normalize, resolve } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const args = process.argv.slice(2);
const opt = (n: string, d = "") => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const root = normalize(join(import.meta.dir, ".."));
const title = opt("title"), kicker = opt("kicker"), out = opt("out", "card.png");
const plate = opt("plate", "assets/img/plates/sphere-dots.png"), theme = opt("theme", "light") === "dark" ? "dark" : "light";
if (!title) { console.error('usage: bun card.ts --title "…" [--kicker "…"] [--plate assets/img/plates/x.png] [--out card.png] [--theme light|dark]'); process.exit(2); }
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const html = `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/field.css">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  .card { position: relative; width: 1200px; height: 630px; background: var(--bg); color: var(--text); display: grid; grid-template-columns: 1fr 470px; gap: 40px; padding: 56px; box-sizing: border-box; }
  .copy { display: flex; flex-direction: column; justify-content: space-between; }
  .kicker { font-size: 22px; color: var(--text-3); }
  h1 { font-family: var(--display); font-weight: 400; font-size: ${title.length > 48 ? 58 : 70}px; line-height: 1.04; letter-spacing: -0.02em; margin: 0; text-wrap: balance; }
  .name { font-size: 22px; font-weight: 600; }
  .field { position: relative; border-radius: 28px; background: var(--accent); overflow: hidden; }
  .field .dither { position: absolute; inset: 9% 9% 14% 9%; width: auto; --dither-ink: var(--on-accent); -webkit-mask-position: center; mask-position: center; }
  .pill { position: absolute; left: 24px; bottom: 24px; padding: 12px 20px; font-size: 20px; font-weight: 600; color: var(--text); }
</style></head><body>
<div class="card"><div class="copy"><div class="kicker">${esc(kicker)}</div><h1>${esc(title)}</h1><div class="name">Hasan Al-qaysi</div></div>
<div class="field"><span class="dither" style="--src: url('/${plate.replace(/^\/+/, "")}')"></span><span class="pill glass">hasanqaysi.dev</span></div></div>
</body></html>`;

const server = Bun.serve({
  port: 0, hostname: "127.0.0.1",
  async fetch(req) {
    const p = decodeURIComponent(new URL(req.url).pathname);
    if (p === "/__card") return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    const full = normalize(join(root, p));
    if (!full.startsWith(root) || full.includes("/node_modules/") || full.includes("/.git/")) return new Response("Forbidden", { status: 403 });
    const f = Bun.file(full);
    return (await f.exists()) ? new Response(f) : new Response("Not found", { status: 404 });
  },
});
const profile = mkdtempSync(join(tmpdir(), "card-chrome-"));
const CH = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outPath = resolve(out);
const proc = Bun.spawn([CH, "--headless=new", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
  "--virtual-time-budget=4000", "--window-size=1200,630", `--screenshot=${outPath}`, `http://127.0.0.1:${server.port}/__card`], { stdout: "ignore", stderr: "ignore" });
await proc.exited;
server.stop(true);
rmSync(profile, { recursive: true, force: true });
console.log(JSON.stringify({ out: outPath, theme, plate }));
