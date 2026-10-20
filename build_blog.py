#!/usr/bin/env python3
"""Static blog generator for hasanqaysi.dev/blog, in the Field Manual design (DESIGN.md).

Reads markdown posts from blog/posts/*.md (frontmatter + body) and emits static HTML:
  - blog/index.html                  (the listing)
  - blog/<slug>/index.html           (one crawlable page per post, own OG tags)
  - blog/<slug>/card.png             (its social card, made once by tools/card.ts; --cards remakes them)
  - blog/rss.xml                     (feed)
  - sitemap.xml                      (root, includes homepage + posts)

Pages use the one stylesheet (/assets/field.css) and the Press atmosphere (/assets/js/light.js).

Frontmatter: title, date (YYYY-MM-DD), dek, tags: [a, b], and optionally
  scene: landscape-plants     an image in assets/img/art/ shown above the title
  plate: cube-dots            a plate in assets/img/plates/: header art when there is no scene, and the social card
Body: paragraphs, ## headings, > quotes, - lists, ``` code fences (with a language), *italic*, **bold**,
`code`, [links](url), and figures from tools/figures/<name>.json:
  ::figure <name> | caption text

Add a post: drop a new file in blog/posts/<slug>.md, then run:  python3 build_blog.py
Figures and social cards need bun (tools/ uses it), with `bun install` run once in tools/.
"""
import os, re, html, datetime, glob, json, subprocess, sys, xml.sax.saxutils as sx

ROOT = os.path.dirname(os.path.abspath(__file__))
POSTS_DIR = os.path.join(ROOT, "blog", "posts")
BLOG_DIR = os.path.join(ROOT, "blog")
SITE = "https://hasanqaysi.dev"
OG_IMAGE = SITE + "/og-image.png"
AUTHOR = "Hasan Al-qaysi"
EMAIL = "hasanaqeel38@gmail.com"

FAVICON = ("<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E"
           "%3Crect width='32' height='32' rx='8' fill='%23B0E0E6'/%3E%3Ccircle cx='16' cy='16' r='7' fill='%23000'/%3E%3C/svg%3E\">")

LANGS = {'ts': 'TypeScript', 'tsx': 'TypeScript', 'js': 'JavaScript', 'jsx': 'JavaScript', 'py': 'Python', 'python': 'Python',
         'sh': 'Shell', 'bash': 'Shell', 'zsh': 'Shell', 'json': 'JSON', 'sql': 'SQL', 'yaml': 'YAML', 'yml': 'YAML',
         'html': 'HTML', 'css': 'CSS', 'go': 'Go', 'rust': 'Rust'}
THEME_EARLY = '<script>try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}</script>'  # applies a saved light/dark pick before paint
THEME_BUTTON = '<button class="theme-toggle" type="button" aria-label="Switch to dark mode"><svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg></button>'
TAGS = {'ai': 'AI', 'llm': 'LLMs', 'b2b-saas': 'B2B SaaS', 'aws': 'AWS'}  # anything else: sentence case

# ---------- markdown ----------
def parse_front_matter(text):
    meta, body = {}, text
    if text.startswith('---'):
        end = text.find('\n---', 3)
        if end != -1:
            fm = text[3:end].strip()
            body = text[end + 4:].lstrip('\n')
            for line in fm.splitlines():
                if ':' not in line:
                    continue
                k, v = line.split(':', 1)
                k, v = k.strip(), v.strip()
                if k == 'tags':
                    v = v.strip('[]')
                    meta[k] = [t.strip().strip('"\'') for t in v.split(',') if t.strip()]
                else:
                    meta[k] = v.strip('"\'')
    return meta, body

def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r'`([^`]+)`', lambda m: '<code>' + m.group(1) + '</code>', s)
    s = re.sub(r'\*\*([^*]+)\*\*', lambda m: '<strong>' + m.group(1) + '</strong>', s)
    s = re.sub(r'(?<![*\w])\*([^*\s][^*]*?)\*(?![*\w])', lambda m: '<em>' + m.group(1) + '</em>', s)
    s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', lambda m: '<a href="' + m.group(2) + '">' + m.group(1) + '</a>', s)
    return s

def parse_blocks(body):
    """Returns list of (type, payload). Types: p, h2, quote, list, code, figure."""
    lines = body.split('\n')
    blocks, i = [], 0
    starts = ('## ', '> ', '```', '::figure ')
    while i < len(lines):
        line = lines[i]
        if line.strip().startswith('```'):
            lang = line.strip()[3:].strip()
            buf = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith('```'):
                buf.append(lines[i]); i += 1
            i += 1
            blocks.append(('code', (lang, '\n'.join(buf))))
        elif line.startswith('::figure '):
            name, _, caption = line[len('::figure '):].partition('|')
            blocks.append(('figure', (name.strip(), caption.strip()))); i += 1
        elif line.startswith('## '):
            blocks.append(('h2', line[3:].strip())); i += 1
        elif line.startswith('> '):
            buf = []
            while i < len(lines) and lines[i].startswith('> '):
                buf.append(lines[i][2:].strip()); i += 1
            blocks.append(('quote', ' '.join(buf)))
        elif re.match(r'^[-*] ', line):
            items = []
            while i < len(lines) and re.match(r'^[-*] ', lines[i]):
                items.append(lines[i][2:].strip()); i += 1
            blocks.append(('list', items))
        elif line.strip() == '':
            i += 1
        else:
            buf = []
            while i < len(lines) and lines[i].strip() != '' and not lines[i].startswith(starts) and not re.match(r'^[-*] ', lines[i]):
                buf.append(lines[i].strip()); i += 1
            blocks.append(('p', ' '.join(buf)))
    return blocks

def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', re.sub(r'<[^>]+>', '', s).lower()).strip('-')

def bun(*args):
    try:
        return subprocess.run(['bun', *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    except FileNotFoundError:
        sys.exit('build_blog.py: figures and social cards need bun (https://bun.sh)')
    except subprocess.CalledProcessError as e:
        sys.exit(f'build_blog.py: bun {" ".join(args)} failed:\n{e.stderr}')

def figure_html(name, caption, n, wide):
    spec = os.path.join('tools', 'figures', name + '.json')
    if not os.path.exists(os.path.join(ROOT, spec)):
        sys.exit(f'build_blog.py: no figure spec at {spec}')
    svg = bun('tools/diagram.ts', spec).strip()
    cls = 'figure figure--wide' if wide else 'figure'
    return (f'<figure class="{cls}" data-play><div class="plate plate--scroll">{svg}</div>'
            f'<figcaption><b>Fig. {n}</b>{inline(caption)}</figcaption></figure>')

def render_blocks(blocks, wide):
    """Text blocks go inside .prose; figures and code sit beside it, so wide ones can break out."""
    out, prose, fig, first_p = [], [], 0, True
    def flush():
        if prose:
            out.append('<div class="prose">' + '\n'.join(prose) + '</div>')
            prose.clear()
    for t, x in blocks:
        if t == 'p':
            prose.append(f'<p class="dropcap">{inline(x)}</p>' if first_p else f'<p>{inline(x)}</p>')
            first_p = False
        elif t == 'h2':
            prose.append(f'<h2 id="{slugify(x)}">{inline(x)}</h2>')
        elif t == 'quote':
            prose.append(f'<blockquote class="pull"><p>{inline(x)}</p></blockquote>')
        elif t == 'list':
            prose.append('<ul>' + ''.join(f'<li>{inline(it)}</li>' for it in x) + '</ul>')
        elif t == 'code':
            lang, code = x
            flush()
            out.append(f'<figure class="code"><div class="code-head"><span>{LANGS.get(lang.lower(), lang or "Code")}</span></div>'
                       f'<pre><code>{html.escape(code)}</code></pre></figure>')
        elif t == 'figure':
            fig += 1
            flush()
            out.append(figure_html(x[0], x[1], fig, wide))
    flush()
    return '\n'.join(out)

def reading_min(dek, blocks):
    words = len(dek.split())
    for t, x in blocks:
        if t == 'list':
            words += sum(len(it.split()) for it in x)
        elif t == 'code':
            words += len(x[1].split())
        elif t != 'figure':
            words += len(str(x).split())
    return max(1, round(words / 200))

def fmt_month(iso):
    return datetime.date.fromisoformat(iso).strftime('%B %Y')

def fmt_day(iso):
    d = datetime.date.fromisoformat(iso)
    return f'{d.day} {d.strftime("%B %Y")}'

# ---------- page parts ----------
def head(title, desc, url, og_type='website', image=OG_IMAGE, figures=False):
    d = html.escape(desc, quote=True)
    t = html.escape(title, quote=True)
    return ('<!doctype html><html lang="en" data-atmos="press"><head>'
            '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            f'{THEME_EARLY}'
            f'<title>{t}</title>'
            f'<meta name="description" content="{d}">'
            f'<link rel="canonical" href="{url}">'
            f'<meta name="author" content="{AUTHOR}">'
            '<meta name="theme-color" content="#D1CBC1" media="(prefers-color-scheme: light)">'
            '<meta name="theme-color" content="#121110" media="(prefers-color-scheme: dark)">'
            f'{FAVICON}'
            '<link rel="alternate" type="application/rss+xml" title="Hasan Al-qaysi — Writing" href="/blog/rss.xml">'
            f'<meta property="og:type" content="{og_type}">'
            '<meta property="og:site_name" content="Hasan Al-qaysi">'
            f'<meta property="og:title" content="{t}">'
            f'<meta property="og:description" content="{d}">'
            f'<meta property="og:url" content="{url}">'
            f'<meta property="og:image" content="{image}">'
            '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
            '<meta name="twitter:card" content="summary_large_image">'
            f'<meta name="twitter:title" content="{t}">'
            f'<meta name="twitter:description" content="{d}">'
            f'<meta name="twitter:image" content="{image}">'
            '<link rel="preload" href="/assets/fonts/newsreader-roman-latin.woff2" as="font" type="font/woff2" crossorigin>'
            '<link rel="stylesheet" href="/assets/field.css">'
            + ('<script src="/assets/js/figures.js" defer></script>' if figures else '')
            + '<script src="/assets/js/light.js" defer></script><script src="/assets/js/theme.js" defer></script>'
            '</head>')

def nav_html(active):
    def a(href, label, key):
        cur = ' aria-current="page"' if key == active else ''
        return f'<a href="{href}"{cur}>{label}</a>'
    return ('<div class="backdrop" aria-hidden="true"><img src="/assets/img/art/backdrop-blur.webp" alt=""></div>'
            '<div class="nav-wrap"><nav class="nav glass" aria-label="Primary">'
            '<a class="name" href="/">Hasan Al-qaysi</a>'
            + a('/#work', 'Work', 'work') + a('/blog/', 'Writing', 'writing') + a('/#contact', 'Contact', 'contact')
            + THEME_BUTTON + '</nav></div>')

FOOT = (f'<footer class="footer"><span>© {datetime.date.today().year} Hasan Al-qaysi</span>'
        '<span><a href="/blog/">All writing</a> &nbsp; <a href="/blog/rss.xml">RSS</a></span></footer>')

def art_html(p):
    scene = p.get('scene')
    if scene and os.path.exists(os.path.join(ROOT, 'assets', 'img', 'art', scene + '.webp')):
        small = f'/assets/img/art/{scene}-800.webp' if os.path.exists(os.path.join(ROOT, 'assets', 'img', 'art', scene + '-800.webp')) else None
        srcset = f' srcset="{small} 800w, /assets/img/art/{scene}.webp 1600w" sizes="(max-width: 900px) 100vw, 1200px"' if small else ''
        return (f'<div class="article-art"><img src="/assets/img/art/{scene}.webp"{srcset} '
                'alt="" width="1600" height="900" decoding="async" fetchpriority="high"></div>')
    plate = p.get('plate')
    if plate and os.path.exists(os.path.join(ROOT, 'assets', 'img', 'plates', plate + '.png')):
        return (f'<div class="article-plate"><div class="plate-band" aria-hidden="true">'
                f'<span class="dither" style="--src: url(\'/assets/img/plates/{plate}.png\');"></span></div></div>')
    return ''

# ---------- pages ----------
def post_page(p):
    h2s = [x for t, x in p['blocks'] if t == 'h2']
    has_contents = len(h2s) >= 3
    has_figures = any(t == 'figure' for t, _ in p['blocks'])
    blocks_html = render_blocks(p['blocks'], wide=has_contents)
    when = f'<time datetime="{p["date"]}">{fmt_day(p["date"])}</time><span>{p["read"]} min read</span>'
    if p['tags']:
        when += '<span>' + ' · '.join(html.escape(TAGS.get(t, t.replace('-', ' ').capitalize())) for t in p['tags']) + '</span>'
    ld = {
        "@context": "https://schema.org", "@type": "BlogPosting",
        "headline": p['title'], "description": p['dek'],
        "datePublished": p['date'], "url": p['url'],
        "author": {"@type": "Person", "name": AUTHOR, "url": SITE + "/"},
        "image": p['image'],
    }
    main = (f'<article class="article-main{" with-margin" if has_contents else ""}">'
            + blocks_html
            + '<aside class="author" aria-label="About the author">'
            f'<p>Hasan Al-qaysi builds AI features and automation for small teams. Questions, or a project in mind? <a href="mailto:{EMAIL}">{EMAIL}</a></p>'
            f'<a class="button button--solid" href="mailto:{EMAIL}">Email me</a></aside>'
            '</article>')
    if has_contents:
        toc = ''.join(f'<li><a href="#{slugify(h)}">{inline(h)}</a></li>' for h in h2s)
        layout = f'<div class="article-grid"><details class="contents" open><summary>Contents</summary><ol>{toc}</ol></details>{main}</div>'
    else:
        layout = f'<div class="article-solo">{main}</div>'
    defs = bun('tools/diagram.ts', '--defs').strip() if has_figures else ''
    body = (
        '<body>' + defs + nav_html('writing')
        + '<main class="page">'
        + art_html(p)
        + '<header class="article-head">'
        + f'<p class="when">{when}</p>'
        + f'<h1>{html.escape(p["title"])}</h1>'
        + f'<p class="dek">{html.escape(p["dek"])}</p>'
        + f'<p class="by">By {AUTHOR}</p>'
        + '</header>'
        + layout
        + FOOT + '</main>'
        + '<script type="application/ld+json">' + json.dumps(ld) + '</script>'
        + '</body></html>'
    )
    return head(p['title'] + ' — ' + AUTHOR, p['dek'], p['url'], 'article', p['image'], has_figures) + body

def listing_page(posts):
    rows = ''.join(
        f'<li class="post"><h3><a href="/blog/{p["slug"]}/">{html.escape(p["title"])}</a></h3>'
        f'<time datetime="{p["date"]}">{fmt_month(p["date"])}</time>'
        f'<p class="dek">{html.escape(p["dek"])}</p></li>'
        for p in posts)
    body = (
        '<body>' + nav_html('writing')
        + '<main class="page">'
        + '<header class="hero" style="padding-bottom: var(--s-7);">'
        + '<h1 class="display rise" style="--i: 0">Writing</h1>'
        + '<p class="lead rise" style="--i: 1; margin-top: var(--s-5); max-width: 46ch;">Short, specific notes on AI features, automation and shipping systems that keep running. What worked, and what I’d do again.</p>'
        + '</header>'
        + '<div class="banner"><img src="/assets/img/art/cave.webp" srcset="/assets/img/art/cave-800.webp 800w, /assets/img/art/cave.webp 1600w" '
          'sizes="(max-width: 900px) 100vw, 1200px" style="object-position: 50% 70%;" '
          'alt="An engraving of a lone figure at the mouth of a cave, looking out at a sunrise over a river valley" decoding="async"></div>'
        + f'<ol class="posts">{rows}</ol>'
        + FOOT + '</main></body></html>'
    )
    return head('Writing — ' + AUTHOR,
                'Short, specific writing on AI features, automation and shipping production systems. By Hasan Al-qaysi.',
                SITE + '/blog/') + body

def ensure_card(p, force):
    """Each post's social card: tools/card.ts with the post's plate, made once and kept."""
    out = os.path.join(BLOG_DIR, p['slug'], 'card.png')
    plate = p.get('plate')
    if not plate:
        return OG_IMAGE
    if force or not os.path.exists(out):
        bun('tools/card.ts', '--title', p['title'], '--kicker', 'Writing · ' + fmt_month(p['date']),
            '--plate', f'assets/img/plates/{plate}.png', '--out', out)
    return f'{SITE}/blog/{p["slug"]}/card.png'

def build(force_cards=False):
    files = sorted(glob.glob(os.path.join(POSTS_DIR, '*.md')))
    posts = []
    for f in files:
        meta, raw = parse_front_matter(open(f, encoding='utf-8').read())
        slug = meta.get('slug') or os.path.splitext(os.path.basename(f))[0]
        blocks = parse_blocks(raw)
        posts.append({
            'slug': slug, 'title': meta['title'], 'dek': meta.get('dek', ''),
            'date': meta['date'], 'tags': meta.get('tags', []), 'blocks': blocks,
            'scene': meta.get('scene'), 'plate': meta.get('plate'),
            'read': reading_min(meta.get('dek', ''), blocks),
            'url': f'{SITE}/blog/{slug}',  # no trailing slash: it is each post's canonical URL and RSS guid
        })
    posts.sort(key=lambda p: p['date'], reverse=True)

    # posts (cards first: the page's OG tags point at them)
    for p in posts:
        d = os.path.join(BLOG_DIR, p['slug'])
        os.makedirs(d, exist_ok=True)
        p['image'] = ensure_card(p, force_cards)
        open(os.path.join(d, 'index.html'), 'w', encoding='utf-8').write(post_page(p))
    # listing
    open(os.path.join(BLOG_DIR, 'index.html'), 'w', encoding='utf-8').write(listing_page(posts))
    # rss
    items = ''.join(
        f'<item><title>{sx.escape(p["title"])}</title><link>{p["url"]}</link>'
        f'<guid>{p["url"]}</guid><pubDate>{datetime.datetime.fromisoformat(p["date"]).strftime("%a, %d %b %Y 00:00:00 +0000")}</pubDate>'
        f'<description>{sx.escape(p["dek"])}</description></item>'
        for p in posts)
    rss = ('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>'
           f'<title>Hasan Al-qaysi — Writing</title><link>{SITE}/blog/</link>'
           '<description>Short, specific writing on AI features, automation and shipping systems.</description>'
           f'<language>en</language>{items}</channel></rss>')
    open(os.path.join(BLOG_DIR, 'rss.xml'), 'w', encoding='utf-8').write(rss)
    # sitemap
    urls = [SITE + '/', SITE + '/blog/'] + [p['url'] for p in posts]
    sm = ('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
          + ''.join(f'<url><loc>{u}</loc></url>' for u in urls) + '</urlset>')
    open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8').write(sm)

    print(f'Built {len(posts)} posts:')
    for p in posts:
        print(f'  /blog/{p["slug"]}/  ({p["read"]} min)  {p["title"]}')
    print('Wrote blog/index.html, blog/rss.xml, sitemap.xml')

if __name__ == '__main__':
    build(force_cards='--cards' in sys.argv)
