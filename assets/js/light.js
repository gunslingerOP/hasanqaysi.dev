/* light.js — the page's atmosphere and its still plates.
   Turn it on with <html data-atmos="press|sky|lamp">; without it, nothing runs and plates stay PNG masks.
   - press (picked 2026-10-20): a flat ground with the gradient printed in powder-blue dots across the top.
   - sky, lamp (reference only): a powder-blue sky with a slow sun / a flat ground with a slow pool of light.
   Plates: every .dither whose --src is /assets/img/plates/<shape>-<style>.png (or data-plate="<shape> <style>")
   is redrawn on a canvas in two inks (shade in --dither-ink, light in --plate-hi), lit from the upper left.
   Plates never move (Hasan: the moving version looked forced); each is drawn once per size and theme. */
(() => {
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const ATMOS = {
    press: { band: true, style: "dots" },
    sky: { glow: "sweep", period: 26000 },
    lamp: { glow: "orbit", period: 48000, style: "lines" },
  };
  const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21].map((v) => (v + 0.5) / 64);

  // ---------- the objects: signed distance fields, floating above a ground plane at y = 0 ----------
  const C = 1.2;
  const box = (x, y, z, bx, by, bz) => {
    const qx = Math.abs(x) - bx, qy = Math.abs(y) - by, qz = Math.abs(z) - bz;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
  };
  const turn = (x, z) => [(x + z) * Math.SQRT1_2, (z - x) * Math.SQRT1_2];
  const TILT = 0.32, CT = Math.cos(TILT), ST = Math.sin(TILT);
  const SDF = {
    sphere: (x, y, z) => Math.hypot(x, y - C, z) - 0.95,
    cube: (x, y, z) => { const [u, w] = turn(x, z); return box(u, y - C, w, 0.64, 0.64, 0.64) - 0.02; },
    cylinder: (x, y, z) => { const dx = Math.hypot(x, z) - 0.7, dy = Math.abs(y - C) - 0.78; return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)); },
    stack: (x, y, z) => { const [u, w] = turn(x, z); let d = Infinity; for (const o of [-0.46, 0, 0.46]) d = Math.min(d, box(u, y - C - o, w, 0.7, 0.1, 0.7) - 0.015); return d; },
    ring: (x, y, z) => { const py = y - C, yy = py * CT - z * ST, zz = py * ST + z * CT; return Math.hypot(Math.hypot(x, zz) - 0.72, yy) - 0.3; },
    cone: (x, y, z) => { // apex up, base radius 0.8, height 1.7 (exact cone distance)
      const qx = 0.8, qy = -1.7, wx = Math.hypot(x, z), wy = y - (C + 0.85);
      const t = Math.min(Math.max((wx * qx + wy * qy) / (qx * qx + qy * qy), 0), 1);
      const ax = wx - qx * t, ay = wy - qy * t, bx = wx - qx * Math.min(Math.max(wx / qx, 0), 1), by = wy - qy;
      const s = Math.max(-(wx * qy - wy * qx), -(wy - qy));
      return Math.sqrt(Math.min(ax * ax + ay * ay, bx * bx + by * by)) * Math.sign(s);
    },
  };

  // ---------- the camera (orthographic, 32° above the ground) and the light (upper left, in front) ----------
  const EL = (32 * Math.PI) / 180, CE = Math.cos(EL), SE = Math.sin(EL), HALF = 1.62, AIM = 1.0;
  const V = [0, SE, CE]; // towards the camera
  const L = (() => { const a = (135 * Math.PI) / 180, e = (40 * Math.PI) / 180; return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)]; })();

  // ray-march each cell: object cells keep their normal, ground cells their position (for the shadow)
  const build = (shape, n) => {
    const sdf = SDF[shape], kind = new Uint8Array(n * n), data = new Float32Array(n * n * 3);
    const dy = -SE, dz = -CE, e = 0.003;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const u = (((i + 0.5) / n) * 2 - 1) * HALF, v = (1 - ((j + 0.5) / n) * 2) * HALF;
      const ox = u, oy = AIM + v * CE + 6 * SE, oz = -v * SE + 6 * CE, k = j * n + i;
      // jump to a bounding sphere around the object, then march
      const cy = oy - C, b = cy * dy + oz * dz, disc = b * b - (ox * ox + cy * cy + oz * oz - 2.1);
      let hit = -1;
      if (disc > 0) {
        let t = Math.max(0, -b - Math.sqrt(disc));
        const end = -b + Math.sqrt(disc);
        for (let s = 0; s < 90 && t < end; s++) { const d = sdf(ox, oy + dy * t, oz + dz * t); if (d < 0.0015) { hit = t; break; } t += d; }
      }
      if (hit >= 0) {
        const px = ox, py = oy + dy * hit, pz = oz + dz * hit;
        const nx = sdf(px + e, py, pz) - sdf(px - e, py, pz), ny = sdf(px, py + e, pz) - sdf(px, py - e, pz), nz = sdf(px, py, pz + e) - sdf(px, py, pz - e);
        const l = Math.hypot(nx, ny, nz) || 1;
        kind[k] = 1; data[k * 3] = nx / l; data[k * 3 + 1] = ny / l; data[k * 3 + 2] = nz / l;
      } else {
        const t = -oy / dy, gx = ox, gz = oz + dz * t;
        if (Math.hypot(gx, gz) < 2.6) { kind[k] = 2; data[k * 3] = gx; data[k * 3 + 2] = gz; }
      }
    }
    return { n, kind, data };
  };

  // shade every cell and print it: dots in one or two inks, or engraved vertical lines
  const paint = (p) => {
    const { n, kind, data } = p.gb, px = p.px, [lx, ly, lz] = L;
    let hx = lx + V[0], hy = ly + V[1], hz = lz + V[2]; const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
    // the shadow: the object's centre projected along the light onto the ground, stretched by how low the light is
    const cx = (-lx * C) / ly, cz = (-lz * C) / ly, al = Math.hypot(lx, lz), ax = lx / al, az = lz / al, major = 0.95 / ly, minor = 0.95;
    const lines = p.style === "lines", two = p.hi !== 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, t = kind[k], b = BAYER[((j & 7) << 3) | (i & 7)];
      let out = 0;
      if (t === 1) {
        const nx = data[k * 3], ny = data[k * 3 + 1], nz = data[k * 3 + 2];
        const diff = Math.max(0, nx * lx + ny * ly + nz * lz), spec = Math.max(0, nx * hx + ny * hy + nz * hz) ** 36;
        const tone = Math.min(1, 0.07 + 0.93 * diff + 0.45 * spec);
        if (lines) out = Math.abs(((i % 4) + 0.5) / 4 - 0.5) * 2 < 1 - tone + (b - 0.5) * 0.3 ? p.ink : 0;
        else if (two) { const lv = Math.min(2, Math.floor(tone * 2 + b)); out = lv === 0 ? p.ink : lv === 2 ? p.hi : 0; }
        else out = tone < b ? p.ink : 0;
      } else if (t === 2) {
        const rx = data[k * 3] - cx, rz = data[k * 3 + 2] - cz, along = rx * ax + rz * az, across = rx * az - rz * ax;
        const s = Math.min(1, Math.max(0, 1.1 - Math.hypot(along / major, across / minor))) ** 1.4 * 0.85;
        if (lines) out = Math.abs(((i % 4) + 0.5) / 4 - 0.5) * 2 < s + (b - 0.5) * 0.3 ? p.ink : 0;
        else out = b < s ? p.ink : 0;
      }
      px[k] = out;
    }
    p.ctx.putImageData(p.img, 0, 0);
  };

  // ---------- colours come from the tokens, resolved through real properties ----------
  const rgba = (s) => { const m = s.match(/[\d.]+/g) || [0, 0, 0, 0]; const a = m.length > 3 ? Math.round(Number(m[3]) * 255) : 255; return a === 0 ? 0 : ((a << 24) | (m[2] << 16) | (m[1] << 8) | m[0]) >>> 0; };
  const inks = (p) => { const cs = getComputedStyle(p.canvas); p.ink = rgba(cs.color); p.hi = rgba(cs.textDecorationColor); };

  // ---------- state ----------
  let atmos = null, anim = null, ground = null, glow = null, band = null, raf = 0;
  const plates = [];
  const preset = () => ATMOS[atmos];

  const size = (p) => {
    const w = p.el.clientWidth;
    if (!w) return false;
    const style = preset()?.style || p.style0;
    const n = Math.max(48, Math.min(style === "lines" ? 220 : 120, Math.round(w / (style === "lines" ? 1 : 2))));
    if (p.gb && p.gb.n === n && p.style === style) return true;
    p.style = style; p.canvas.width = n; p.canvas.height = n;
    p.ctx = p.canvas.getContext("2d"); p.img = p.ctx.createImageData(n, n); p.px = new Uint32Array(p.img.data.buffer);
    p.gb = null; p.n = n; p.drawn = false;
    return true;
  };

  // draw what is visible and not yet drawn; at most one ray-march per frame so scrolling stays smooth
  const frame = () => {
    raf = 0;
    if (!preset()) return;
    let built = false, more = false;
    for (const p of plates) {
      if (!p.visible || !size(p) || p.drawn) continue;
      if (!p.gb) { if (built) { more = true; continue; } p.gb = build(p.shape, p.n); built = true; }
      inks(p); paint(p); p.drawn = true; p.el.classList.add("is-live");
    }
    if (more) raf = requestAnimationFrame(frame);
  };
  const wake = () => { if (!raf && preset()) raf = requestAnimationFrame(frame); };

  // ---------- the ground ----------
  const paintBand = () => {
    const w = Math.ceil(innerWidth / 3), h = Math.ceil((innerHeight * 0.46) / 3);
    band.width = w; band.height = h;
    const ctx = band.getContext("2d"), img = ctx.createImageData(w, h), px = new Uint32Array(img.data.buffer), ink = rgba(getComputedStyle(band).color);
    for (let j = 0; j < h; j++) { const dens = 0.42 * (1 - j / h) ** 1.8; for (let i = 0; i < w; i++) if (BAYER[((j & 7) << 3) | (i & 7)] < dens) px[j * w + i] = ink; }
    ctx.putImageData(img, 0, 0);
  };
  const setupGround = () => {
    anim?.cancel(); anim = null;
    const a = preset();
    if (!a) return;
    if (!ground) {
      ground = document.createElement("div");
      ground.className = "ground"; ground.setAttribute("aria-hidden", "true");
      ground.innerHTML = '<div class="ground-light"></div>';
      band = document.createElement("canvas");
      band.className = "ground-print"; band.setAttribute("aria-hidden", "true");
      document.body.prepend(ground, band); // the printed band sits at the top of the document, not the screen
      glow = ground.firstChild;
    }
    if (a.glow === "sweep") anim = glow.animate([{ transform: "translateX(-34vw)" }, { transform: "translateX(34vw)" }], { duration: a.period / 2, iterations: Infinity, direction: "alternate", easing: "ease-in-out" });
    if (a.glow === "orbit") anim = glow.animate([{ transform: "rotate(0turn) translateX(30vw) rotate(0turn)" }, { transform: "rotate(1turn) translateX(30vw) rotate(-1turn)" }], { duration: a.period, iterations: Infinity });
    if (anim && reduce.matches) anim.pause();
    if (a.band) paintBand();
  };

  // ---------- plates ----------
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) { const p = plates.find((q) => q.el === e.target); if (p) p.visible = e.isIntersecting; }
    wake();
  }, { rootMargin: "200px" });
  const resized = new ResizeObserver(() => { for (const p of plates) p.drawn = false; wake(); });
  const collect = () => {
    for (const el of document.querySelectorAll(".dither")) {
      if (plates.some((p) => p.el === el)) continue;
      const m = (el.dataset.plate || (el.style.getPropertyValue("--src").match(/plates\/(\w+)-(dots|lines)/) || []).slice(1).join(" ")).split(/\s+/);
      if (!SDF[m[0]]) continue;
      const canvas = document.createElement("canvas");
      canvas.className = "plate-canvas"; canvas.setAttribute("aria-hidden", "true");
      el.appendChild(canvas);
      plates.push({ el, canvas, shape: m[0], style0: m[1] === "lines" ? "lines" : "dots", visible: false });
      seen.observe(el); resized.observe(el);
    }
  };

  const setup = () => {
    const next = root.dataset.atmos in ATMOS ? root.dataset.atmos : null;
    if (next === atmos && ground) return;
    atmos = next;
    setupGround();
    if (!atmos) return;
    collect();
    for (const p of plates) { p.drawn = false; p.el.classList.remove("is-live"); }
    wake();
  };
  const recolour = () => { for (const p of plates) p.drawn = false; if (preset()?.band) paintBand(); wake(); };

  new MutationObserver((list) => { for (const m of list) m.attributeName === "data-atmos" ? setup() : recolour(); })
    .observe(root, { attributes: true, attributeFilter: ["data-atmos", "data-theme", "style"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", recolour);
  reduce.addEventListener("change", () => { atmos = undefined; setup(); });
  addEventListener("resize", () => { if (preset()?.band) paintBand(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup); else setup();
})();
