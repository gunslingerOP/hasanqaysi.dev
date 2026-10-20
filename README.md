# hasanqaysi.dev

My site and writing: [hasanqaysi.dev](https://hasanqaysi.dev).

Static HTML on GitHub Pages. No framework, and the pages themselves have no build step.

- `index.html` is the homepage.
- `assets/field.css` is the one stylesheet. Tokens sit at the top, and light and dark come from `light-dark()`.
- `assets/js/` holds three small scripts:
  - `figures.js` runs the diagram tours.
  - `light.js` draws the printed ground and the two-ink plates live on a canvas.
  - `theme.js` is the light/dark switch.
- `blog/posts/*.md` are the posts. `python3 build_blog.py` renders them into `blog/`, with an RSS feed, a sitemap and a social card for each post.
- `tools/` holds the bun scripts that make the house artwork:
  - `diagram.ts` turns a JSON spec into a themed SVG figure.
  - `plate.ts` prints an object in 1-bit dots or engraved lines.
  - `card.ts` makes a social card.
  - `contrast.ts` checks the palette against WCAG.

## Run it

```sh
cd tools && bun install && cd ..   # once: figures and social cards need bun
python3 build_blog.py              # renders blog/ from blog/posts/
python3 -m http.server             # then open http://localhost:8000
```

Text and artwork © Hasan Al-qaysi. The fonts are under the SIL Open Font License; their licences are in `assets/fonts/`.
