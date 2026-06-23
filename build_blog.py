#!/usr/bin/env python3
"""Static blog generator for hasanqaysi.dev/blog.

Reads markdown posts from blog/posts/*.md (frontmatter + body) and emits
static, SEO-friendly HTML:
  - blog/index.html                  (the listing)
  - blog/<slug>/index.html           (one crawlable page per post, own OG tags)
  - blog/rss.xml                     (feed)
  - sitemap.xml                      (root, includes homepage + posts)

No runtime framework. The only JS on a page is a tiny reading-progress bar.
Design tokens are ported faithfully from the designer's handoff.

Add a post: drop a new file in blog/posts/<slug>.md, then run:  python3 build_blog.py
"""
import os, re, html, datetime, glob, xml.sax.saxutils as sx

ROOT = os.path.dirname(os.path.abspath(__file__))
POSTS_DIR = os.path.join(ROOT, "blog", "posts")
BLOG_DIR = os.path.join(ROOT, "blog")
SITE = "https://hasanqaysi.dev"
OG_IMAGE = SITE + "/og-image.png"
AUTHOR = "Hasan Al-qaysi"

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">')

FAVICON = ("<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' "
           "viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%230A0C0E'/%3E%3Crect x='9' "
           "y='9' width='14' height='14' rx='3' fill='%23C6F94E'/%3E%3C/svg%3E\">")

CSS = """*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:#0A0C0E;color:#ECEFF1;font-family:'Geist','Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:hidden}
::selection{background:#C6F94E;color:#0A0C0E}
a{color:inherit;text-decoration:none}
a:focus-visible,button:focus-visible{outline:2px solid #C6F94E;outline-offset:3px;border-radius:3px}
@keyframes revealIn{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
.reveal{animation:revealIn .7s cubic-bezier(.2,.7,.2,1)}
.grid-bg{position:fixed;inset:0;z-index:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px);background-size:64px 64px;-webkit-mask-image:radial-gradient(120% 90% at 70% 0%,#000 0%,rgba(0,0,0,0.35) 55%,transparent 100%);mask-image:radial-gradient(120% 90% at 70% 0%,#000 0%,rgba(0,0,0,0.35) 55%,transparent 100%)}
header.nav{position:fixed;top:0;left:0;right:0;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px clamp(20px,5vw,64px);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);background:linear-gradient(to bottom,rgba(10,12,14,0.92),rgba(10,12,14,0))}
.brand{font-family:'Geist Mono',monospace;font-size:0.74rem;letter-spacing:0.12em;color:#ECEFF1;display:flex;align-items:center;gap:10px}
.brand i{width:8px;height:8px;border-radius:2px;background:#C6F94E;display:inline-block}
.nav nav{display:flex;flex-wrap:wrap;gap:clamp(14px,2.4vw,30px);font-family:'Geist Mono',monospace;font-size:0.72rem;letter-spacing:0.1em;color:#93999E}
.nav nav a{transition:color .2s}
.nav nav a:hover{color:#ECEFF1}
.nav nav a.active{color:#C6F94E}
.progress{position:fixed;top:0;left:0;right:0;height:2px;z-index:60;background:transparent}
.progress>div{height:100%;width:0%;background:#C6F94E;box-shadow:0 0 10px #C6F94E;transition:width .08s linear}
footer.foot{position:relative;z-index:1;border-top:1px solid rgba(255,255,255,0.06)}
footer.foot .inner{max-width:940px;margin:0 auto;padding:30px clamp(20px,5vw,48px);display:flex;flex-wrap:wrap;justify-content:space-between;gap:14px;font-family:'Geist Mono',monospace;font-size:0.7rem;letter-spacing:0.1em;color:#6E767C}
footer.foot a{color:#ECEFF1;transition:color .2s}
footer.foot a:hover{color:#C6F94E}
/* listing */
.list-wrap{position:relative;z-index:1;max-width:940px;margin:0 auto;padding:clamp(120px,18vh,180px) clamp(20px,5vw,48px) clamp(70px,11vh,120px)}
.list-head{margin-bottom:clamp(48px,7vh,80px);max-width:640px}
.eyebrow{font-family:'Geist Mono',monospace;font-size:0.78rem;letter-spacing:0.2em;color:#C6F94E;display:flex;align-items:center;gap:12px;margin-bottom:24px}
.eyebrow i{width:7px;height:7px;border-radius:50%;background:#C6F94E;box-shadow:0 0 12px #C6F94E;display:inline-block}
.list-head h1{margin:0;font-size:clamp(2.5rem,6.5vw,4.5rem);line-height:0.98;letter-spacing:-0.03em;font-weight:600}
.list-head p{margin:26px 0 0;font-size:clamp(1.05rem,1.5vw,1.25rem);line-height:1.55;color:#93999E;max-width:50ch;text-wrap:pretty}
.rows{display:flex;flex-direction:column}
.row{display:block;padding:clamp(26px,3.4vw,38px) 0;border-top:1px solid rgba(255,255,255,0.09);transition:padding-left .3s ease}
.row:hover{padding-left:14px}
.row:hover .row-title{color:#C6F94E}
.row-end{border-top:1px solid rgba(255,255,255,0.09)}
.meta{display:flex;flex-wrap:wrap;align-items:center;gap:14px;font-family:'Geist Mono',monospace;font-size:0.7rem;letter-spacing:0.1em;color:#6E767C;margin-bottom:14px}
.meta .sep{color:rgba(255,255,255,0.18)}
.pill{color:#C6F94E;border:1px solid rgba(198,249,78,0.4);border-radius:5px;padding:3px 8px}
.row-title{margin:0;font-size:clamp(1.5rem,3vw,2.3rem);line-height:1.12;letter-spacing:-0.025em;font-weight:600;color:#ECEFF1;transition:color .25s}
.row-dek{margin:12px 0 0;font-size:clamp(1rem,1.4vw,1.15rem);line-height:1.5;color:#93999E;max-width:60ch;text-wrap:pretty}
.row-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:18px}
.chip{font-family:'Geist Mono',monospace;font-size:0.66rem;letter-spacing:0.04em;color:#7F868B;padding:4px 9px;border:1px solid rgba(255,255,255,0.1);border-radius:6px}
.read{margin-left:auto;font-family:'Geist Mono',monospace;font-size:0.72rem;letter-spacing:0.06em;color:#C6F94E}
/* article */
.art{position:relative;z-index:1;max-width:720px;margin:0 auto;padding:clamp(110px,16vh,160px) clamp(20px,5vw,40px) clamp(80px,12vh,140px)}
.back{display:inline-block;background:none;border:none;cursor:pointer;font-family:'Geist Mono',monospace;font-size:0.74rem;letter-spacing:0.08em;color:#93999E;padding:0;margin-bottom:36px;transition:color .2s}
.back:hover{color:#C6F94E}
.art h1{margin:0;font-size:clamp(2rem,5vw,3.3rem);line-height:1.06;letter-spacing:-0.03em;font-weight:600;text-wrap:balance}
.art .dek{margin:22px 0 0;font-size:clamp(1.2rem,2vw,1.5rem);line-height:1.4;color:#93999E;font-weight:400;text-wrap:pretty}
.art .tags{display:flex;flex-wrap:wrap;gap:8px;margin:26px 0 0}
.rule{height:1px;background:rgba(255,255,255,0.09);margin:40px 0}
.post-h2{margin:2.2em 0 0.7em;font-size:clamp(1.35rem,2.6vw,1.85rem);line-height:1.2;letter-spacing:-0.018em;font-weight:600;color:#ECEFF1}
.post-p{margin:1.25em 0 0;font-size:1.13rem;line-height:1.78;color:#C5CACE;text-wrap:pretty}
.post-p code,.post-li code{font-family:'Geist Mono',monospace;font-size:0.92em;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);border-radius:5px;padding:1px 6px;color:#ECEFF1}
.post-p a,.post-li a{color:#C6F94E;border-bottom:1px solid rgba(198,249,78,0.35)}
.post-quote{margin:1.8em 0 0;padding:6px 0 6px 24px;border-left:2px solid #C6F94E;font-size:clamp(1.2rem,2vw,1.45rem);line-height:1.45;letter-spacing:-0.01em;color:#ECEFF1;font-weight:500;text-wrap:pretty}
.post-ul{margin:1.3em 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:12px}
.post-li{display:flex;gap:13px;font-size:1.1rem;line-height:1.6;color:#C5CACE}
.post-li .m{color:#C6F94E;flex:none;font-family:'Geist Mono',monospace}
.codecard{margin:1.7em 0 0;border:1px solid rgba(255,255,255,0.09);border-radius:12px;background:rgba(0,0,0,0.32);overflow:hidden}
.codebar{display:flex;align-items:center;gap:7px;padding:11px 15px;border-bottom:1px solid rgba(255,255,255,0.07)}
.codebar i{width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,0.14);display:inline-block}
.codebar i.lime{background:#C6F94E;opacity:0.55}
.codecard pre{margin:0;padding:18px 20px;overflow-x:auto;font-family:'Geist Mono',monospace;font-size:0.86rem;line-height:1.7;color:#C5CACE}
.art-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px}
.art-foot .btn{background:none;border:1px solid rgba(255,255,255,0.12);border-radius:9px;cursor:pointer;padding:12px 20px;font-family:'Geist Mono',monospace;font-size:0.74rem;letter-spacing:0.08em;color:#ECEFF1;transition:border-color .25s,background .25s}
.art-foot .btn:hover{border-color:rgba(255,255,255,0.28);background:rgba(255,255,255,0.03)}
.art-foot .reply{font-family:'Geist Mono',monospace;font-size:0.74rem;letter-spacing:0.06em;color:#C6F94E;transition:opacity .2s}
.art-foot .reply:hover{opacity:0.7}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}}"""

PROGRESS_JS = """<script>
(function(){var b=document.getElementById('pbar');if(!b)return;function u(){var h=document.documentElement,m=(h.scrollHeight-h.clientHeight)||1;b.style.width=Math.min(100,Math.max(0,(h.scrollTop/m)*100))+'%';}window.addEventListener('scroll',u,{passive:true});u();})();
</script>"""

def nav_html(active):
    def a(href, label, key):
        cls = ' class="active"' if key == active else ''
        return f'<a href="{href}"{cls}>{label}</a>'
    return ('<header class="nav"><a href="/" class="brand"><i></i>HASAN AL-QAYSI</a>'
            '<nav>'
            + a('/#work', 'WORK', 'work')
            + a('/#about', 'ABOUT', 'about')
            + a('/blog', 'WRITING', 'writing')
            + a('/#contact', 'CONTACT', 'contact')
            + '</nav></header>')

FOOT = ('<footer class="foot"><div class="inner">'
        '<a href="/">&larr; HASANQAYSI.DEV</a><span>WRITING &middot; 2026</span>'
        '</div></footer>')

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
    s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', lambda m: '<a href="' + m.group(2) + '">' + m.group(1) + '</a>', s)
    return s

def parse_blocks(body):
    """Returns list of (type, payload). Types: p, h2, quote, list, code."""
    lines = body.split('\n')
    blocks, i = [], 0
    while i < len(lines):
        line = lines[i]
        if line.strip().startswith('```'):
            buf = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith('```'):
                buf.append(lines[i]); i += 1
            i += 1
            blocks.append(('code', '\n'.join(buf)))
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
            while i < len(lines) and lines[i].strip() != '' and not lines[i].startswith(('## ', '> ', '```')) and not re.match(r'^[-*] ', lines[i]):
                buf.append(lines[i].strip()); i += 1
            blocks.append(('p', ' '.join(buf)))
    return blocks

def render_blocks(blocks):
    out = []
    for t, x in blocks:
        if t == 'p':
            out.append(f'<p class="post-p">{inline(x)}</p>')
        elif t == 'h2':
            out.append(f'<h2 class="post-h2">{inline(x)}</h2>')
        elif t == 'quote':
            out.append(f'<blockquote class="post-quote">{inline(x)}</blockquote>')
        elif t == 'list':
            lis = ''.join(f'<li class="post-li"><span class="m">&rarr;</span><span>{inline(it)}</span></li>' for it in x)
            out.append(f'<ul class="post-ul">{lis}</ul>')
        elif t == 'code':
            out.append('<div class="codecard"><div class="codebar"><i></i><i></i><i class="lime"></i></div>'
                       f'<pre><code>{html.escape(x)}</code></pre></div>')
    return '\n'.join(out)

def reading_min(dek, blocks):
    words = len(dek.split())
    for t, x in blocks:
        if t == 'list':
            words += sum(len(it.split()) for it in x)
        else:
            words += len(str(x).split())
    return max(1, round(words / 200))

def fmt_display(iso):
    d = datetime.date.fromisoformat(iso)
    return d.strftime('%b %Y').upper()

# ---------- page templates ----------
def head(title, desc, url, og_type='website'):
    d = html.escape(desc, quote=True)
    t = html.escape(title, quote=True)
    return ('<!DOCTYPE html><html lang="en"><head>'
            '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            f'<title>{t}</title>'
            f'<meta name="description" content="{d}">'
            f'<link rel="canonical" href="{url}">'
            f'<meta name="author" content="{AUTHOR}">'
            '<meta name="theme-color" content="#0A0C0E">'
            f'{FAVICON}'
            f'<meta property="og:type" content="{og_type}">'
            '<meta property="og:site_name" content="Hasan Al-qaysi">'
            f'<meta property="og:title" content="{t}">'
            f'<meta property="og:description" content="{d}">'
            f'<meta property="og:url" content="{url}">'
            f'<meta property="og:image" content="{OG_IMAGE}">'
            '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
            '<meta name="twitter:card" content="summary_large_image">'
            f'<meta name="twitter:title" content="{t}">'
            f'<meta name="twitter:description" content="{d}">'
            f'<meta name="twitter:image" content="{OG_IMAGE}">'
            f'{FONTS}<style>{CSS}</style></head>')

def post_page(p):
    blocks_html = render_blocks(p['blocks'])
    tags = ''.join(f'<span class="chip">{html.escape(t)}</span>' for t in p['tags'])
    ld = {
        "@context": "https://schema.org", "@type": "BlogPosting",
        "headline": p['title'], "description": p['dek'],
        "datePublished": p['date'], "url": p['url'],
        "author": {"@type": "Person", "name": AUTHOR, "url": SITE + "/"},
        "image": OG_IMAGE,
    }
    import json
    ldjson = '<script type="application/ld+json">' + json.dumps(ld) + '</script>'
    body = (
        '<body>'
        '<div class="progress"><div id="pbar"></div></div>'
        '<div class="grid-bg"></div>'
        + nav_html('writing')
        + '<article class="art reveal">'
        + '<a href="/blog" class="back">&larr; ALL WRITING</a>'
        + f'<div class="meta"><span>{p["display"]}</span><span class="sep">/</span><span>{p["read"]} MIN READ</span></div>'
        + f'<h1>{html.escape(p["title"])}</h1>'
        + f'<p class="dek">{html.escape(p["dek"])}</p>'
        + (f'<div class="tags">{tags}</div>' if tags else '')
        + '<div class="rule"></div>'
        + blocks_html
        + '<div class="rule" style="margin:48px 0 28px"></div>'
        + '<div class="art-foot"><a href="/blog" class="btn">&larr; All writing</a>'
        + '<a href="mailto:hasanaqeel38@gmail.com" class="reply">Reply by email &rarr;</a></div>'
        + '</article>'
        + FOOT + ldjson + PROGRESS_JS + '</body></html>'
    )
    return head(p['title'] + ' — ' + AUTHOR, p['dek'], p['url'], 'article') + body

def listing_page(posts):
    rows = []
    for i, p in enumerate(posts):
        pill = '<span class="pill">LATEST</span>' if i == 0 else ''
        tags = ''.join(f'<span class="chip">{html.escape(t)}</span>' for t in p['tags'])
        rows.append(
            f'<a class="row reveal" href="/blog/{p["slug"]}">'
            f'<div class="meta"><span>{p["display"]}</span><span class="sep">/</span><span>{p["read"]} MIN READ</span>{pill}</div>'
            f'<h2 class="row-title">{html.escape(p["title"])}</h2>'
            f'<p class="row-dek">{html.escape(p["dek"])}</p>'
            f'<div class="row-foot">{tags}<span class="read">Read &rarr;</span></div>'
            f'</a>'
        )
    body = (
        '<body>'
        '<div class="grid-bg"></div>'
        + nav_html('writing')
        + '<main class="list-wrap">'
        + '<div class="list-head reveal">'
        + '<div class="eyebrow"><i></i>WRITING</div>'
        + '<h1>Notes from<br>the build.</h1>'
        + '<p>Short, specific writing on automation, AI features, and shipping systems that keep running. No buzzwords — just what worked and what I’d do again.</p>'
        + '</div>'
        + '<div class="rows">' + ''.join(rows) + '<div class="row-end"></div></div>'
        + '</main>' + FOOT + '</body></html>'
    )
    return head('Writing — ' + AUTHOR,
                'Short, specific writing on automation, AI features, and shipping production systems. By Hasan Al-qaysi.',
                SITE + '/blog/') + body

def build():
    files = sorted(glob.glob(os.path.join(POSTS_DIR, '*.md')))
    posts = []
    for f in files:
        meta, raw = parse_front_matter(open(f, encoding='utf-8').read())
        slug = meta.get('slug') or os.path.splitext(os.path.basename(f))[0]
        blocks = parse_blocks(raw)
        posts.append({
            'slug': slug, 'title': meta['title'], 'dek': meta.get('dek', ''),
            'date': meta['date'], 'display': fmt_display(meta['date']),
            'tags': meta.get('tags', []), 'blocks': blocks,
            'read': reading_min(meta.get('dek', ''), blocks),
            'url': f'{SITE}/blog/{slug}',
        })
    posts.sort(key=lambda p: p['date'], reverse=True)

    # listing
    open(os.path.join(BLOG_DIR, 'index.html'), 'w', encoding='utf-8').write(listing_page(posts))
    # posts
    for p in posts:
        d = os.path.join(BLOG_DIR, p['slug'])
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, 'index.html'), 'w', encoding='utf-8').write(post_page(p))
    # rss
    items = ''.join(
        f'<item><title>{sx.escape(p["title"])}</title><link>{p["url"]}</link>'
        f'<guid>{p["url"]}</guid><pubDate>{datetime.datetime.fromisoformat(p["date"]).strftime("%a, %d %b %Y 00:00:00 +0000")}</pubDate>'
        f'<description>{sx.escape(p["dek"])}</description></item>'
        for p in posts)
    rss = ('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>'
           f'<title>Hasan Al-qaysi — Writing</title><link>{SITE}/blog/</link>'
           '<description>Short, specific writing on automation, AI features, and shipping systems.</description>'
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
    build()
