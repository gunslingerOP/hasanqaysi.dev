/* theme.js — the light/dark switch at the end of the nav capsule (.theme-toggle).
   The page follows the system until the reader picks. A pick is kept in localStorage (a per-reader convenience,
   applied before paint by the one-line script at the top of each page's <head>); picking the system's own theme
   again clears it, so the page goes back to following the system. */
(() => {
  const root = document.documentElement, system = matchMedia("(prefers-color-scheme: dark)");
  const effective = () => root.dataset.theme || (system.matches ? "dark" : "light");
  const sync = () => {
    for (const b of document.querySelectorAll(".theme-toggle")) b.setAttribute("aria-label", effective() === "dark" ? "Switch to light mode" : "Switch to dark mode");
    // the browser's own UI follows the page ground, read back from the tokens
    requestAnimationFrame(() => { const c = getComputedStyle(document.body).backgroundColor; for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.content = c; });
  };
  const init = () => {
    for (const b of document.querySelectorAll(".theme-toggle")) b.addEventListener("click", () => {
      const next = effective() === "dark" ? "light" : "dark";
      if (next === (system.matches ? "dark" : "light")) { delete root.dataset.theme; try { localStorage.removeItem("theme"); } catch { /* storage off: still switches */ } }
      else { root.dataset.theme = next; try { localStorage.setItem("theme", next); } catch { /* storage off: still switches */ } }
      sync();
    });
    system.addEventListener("change", sync);
    sync();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
