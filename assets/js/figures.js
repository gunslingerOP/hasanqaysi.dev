/* figures.js — interactive diagrams for kit figures (tools/diagram.ts output). Vanilla, no dependencies.
   Mark a figure with data-play:  <figure class="figure" data-play> … <svg class="diagram"> … </figure>

   What a reader sees (kept simple on purpose; richer motion is added per post when a post needs it):
   - entrance: edges draw on and stations appear in reading order, once, the first time the figure is in view;
   - tour: Play / Step / Reset walk the steps with narration ([data-say]); the edge into the active station marches;
   - hover or focus any station to light its connections and read its line; click it to jump the tour there.
   Nothing moves on its own after the entrance.
   Hooks: [data-step] stations 1…n, [data-edge="k"] the edge into step k, [data-with="k"] parts shown with
   step k (a branch), [data-say] narration. Reduced motion: no entrance; steps are instant. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");

  function setup(figure) {
    const svg = figure.querySelector("svg.diagram");
    if (!svg) return;
    const steps = [...svg.querySelectorAll("[data-step]")].sort((a, b) => a.dataset.step - b.dataset.step);
    const n = Number(steps.at(-1)?.dataset.step || 0);
    if (!n) return;

    // ---------- controls ----------
    const bar = document.createElement("div");
    bar.className = "figure-controls";
    bar.innerHTML = `<button type="button" class="button button--glass" data-a="play">Play</button>
      <button type="button" class="button button--glass" data-a="step">Step</button>
      <button type="button" class="button button--glass" data-a="reset" hidden>Reset</button>
      <p class="figure-say" aria-live="polite"></p>`;
    (figure.querySelector("figcaption") || svg).before(bar);
    const say = bar.querySelector(".figure-say");
    const btn = (a) => bar.querySelector(`[data-a="${a}"]`);
    const intro = "Press Play for a guided tour, or hover a station.";
    say.textContent = intro;

    // ---------- entrance: edges draw on, stations appear in order, once ----------
    const enter = () => {
      if (reduce.matches) return;
      svg.classList.add("is-entering");
      [...svg.querySelectorAll("g.d-node, .d-msg-g, g.d-group, .d-note, .d-step")].forEach((g, i) => g.style.setProperty("--i", i));
      const edges = [...svg.querySelectorAll("path.d-edge")];
      edges.forEach((p, i) => {
        const len = p.getTotalLength();
        p.style.strokeDasharray = `${len}`; p.style.strokeDashoffset = `${len}`;
        p.style.transition = `stroke-dashoffset 700ms cubic-bezier(.2,.8,.2,1) ${150 + i * 70}ms`;
        setTimeout(() => { p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; p.style.transition = ""; }, 1100 + i * 70);
      });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        svg.classList.add("is-entered");
        edges.forEach((p) => { p.style.strokeDashoffset = "0"; });
      }));
      setTimeout(() => svg.classList.remove("is-entering", "is-entered"), 2400);
    };

    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { seen.disconnect(); enter(); }
    }, { threshold: 0.35 });
    seen.observe(svg);

    // ---------- tour: Play / Step / Reset ----------
    let current = 0, timer = null;
    const render = () => {
      svg.classList.toggle("is-playing", current > 0);
      for (const g of svg.querySelectorAll("[data-step], [data-with]")) {
        const k = Number(g.dataset.step || g.dataset.with);
        g.classList.toggle("is-active", k === current); g.classList.toggle("is-done", k < current);
      }
      for (const p of svg.querySelectorAll("[data-edge]")) { const k = Number(p.dataset.edge); p.classList.toggle("is-flowing", k === current); p.classList.toggle("is-done", k < current); }
      const active = steps.find((s) => Number(s.dataset.step) === current);
      say.textContent = current === 0 ? intro : `${current} of ${n}. ${active?.dataset.say || ""}`.trim();
      btn("reset").hidden = current === 0;
    };
    const stop = () => { clearInterval(timer); timer = null; btn("play").textContent = current >= n ? "Replay" : "Play"; };
    const next = () => { current = current >= n ? 1 : current + 1; render(); if (current >= n) stop(); };
    btn("play").addEventListener("click", () => {
      if (timer) return stop();
      if (current >= n) current = 0;
      btn("play").textContent = "Pause"; next();
      timer = setInterval(next, reduce.matches ? 2600 : 1900);
    });
    btn("step").addEventListener("click", () => { stop(); next(); });
    btn("reset").addEventListener("click", () => { stop(); current = 0; render(); btn("play").textContent = "Play"; });

    // ---------- hover / focus: light a station and its connections ----------
    for (const s of steps) {
      if (s.dataset.say) { s.setAttribute("tabindex", "0"); s.setAttribute("role", "button"); s.setAttribute("aria-label", s.dataset.say); }
      const k = Number(s.dataset.step);
      const on = () => {
        svg.classList.add("is-hovering"); s.classList.add("is-hover");
        svg.querySelectorAll(`[data-edge="${k}"], [data-edge="${k + 1}"], [data-with="${k}"]`).forEach((e) => e.classList.add("is-hover"));
        if (!timer) say.textContent = `${k} of ${n}. ${s.dataset.say || ""}`.trim();
      };
      const off = () => { svg.classList.remove("is-hovering"); svg.querySelectorAll(".is-hover").forEach((e) => e.classList.remove("is-hover")); if (!timer) render(); };
      s.addEventListener("pointerenter", on); s.addEventListener("focus", on);
      s.addEventListener("pointerleave", off); s.addEventListener("blur", off);
      s.addEventListener("click", () => { stop(); current = k; render(); });
    }
  }

  const init = () => document.querySelectorAll("figure[data-play]").forEach(setup);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
