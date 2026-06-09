#!/usr/bin/env python3
"""
ToolNest static-site generator (zero dependencies, stdlib only).

How it works
------------
* Each TOOL is one file in  tools/<slug>.html
* Each static PAGE is one file in pages/<slug>.html
* Both start with a JSON front-matter block, then the page body (HTML + an
  optional inline <script>):

      <!--META
      { "title": "...", "slug": "...", "category": "finance",
        "description": "...", "h1": "...", "keywords": "...",
        "faq": [ {"q": "...", "a": "..."} ] }
      META-->
      ...body html...

* Put  <!--AD-->  anywhere in a body to drop an ad unit there.

Run:  python build.py     ->  writes everything into  docs/  (served by Pages)
"""
import json
import os
import re
import shutil
from datetime import date

import config

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "docs")
BASE = config.BASE_PATH.rstrip("/")
YEAR = date.today().year


# --------------------------------------------------------------------------- #
#  Front-matter parsing
# --------------------------------------------------------------------------- #
META_RE = re.compile(r"<!--META\s*(.*?)\s*META-->\s*(.*)", re.DOTALL)


def parse(path):
    raw = open(path, encoding="utf-8").read()
    m = META_RE.match(raw.strip())
    if not m:
        raise SystemExit(f"!! {os.path.basename(path)} is missing a <!--META ... META--> block")
    try:
        meta = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        raise SystemExit(f"!! Bad JSON front-matter in {os.path.basename(path)}: {e}")
    meta.setdefault("slug", os.path.splitext(os.path.basename(path))[0])
    meta.setdefault("h1", meta["title"])
    meta.setdefault("category", None)
    meta.setdefault("keywords", "")
    meta.setdefault("faq", [])
    meta["body"] = m.group(2)
    return meta


# --------------------------------------------------------------------------- #
#  Ad units
# --------------------------------------------------------------------------- #
def ad_unit():
    if config.ADSENSE_CLIENT and config.AD_SLOT:
        return (
            '<div class="ad"><span class="ad-label">Advertisement</span>'
            '<ins class="adsbygoogle" style="display:block" '
            f'data-ad-client="{config.ADSENSE_CLIENT}" data-ad-slot="{config.AD_SLOT}" '
            'data-ad-format="auto" data-full-width-responsive="true"></ins>'
            "<script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>"
        )
    if not config.ADSENSE_CLIENT and config.DEV_AD_PLACEHOLDERS:
        return '<div class="ad ad--placeholder"><span class="ad-label">Ad slot</span></div>'
    return ""  # Auto ads (loader only) or ads disabled


def adsense_head():
    if config.ADSENSE_CLIENT:
        return (
            '<script async crossorigin="anonymous" '
            f'src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client={config.ADSENSE_CLIENT}"></script>'
        )
    return ""


# --------------------------------------------------------------------------- #
#  Structured data (JSON-LD)
# --------------------------------------------------------------------------- #
def jsonld(meta, url):
    blocks = []
    if meta["category"]:
        blocks.append({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            "name": meta["title"],
            "url": url,
            "applicationCategory": "UtilitiesApplication",
            "operatingSystem": "Any (web browser)",
            "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
            "description": meta["description"],
        })
    if meta["faq"]:
        blocks.append({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
                {"@type": "Question", "name": f["q"],
                 "acceptedAnswer": {"@type": "Answer", "text": f["a"]}}
                for f in meta["faq"]
            ],
        })
    return "\n".join(
        f'<script type="application/ld+json">{json.dumps(b)}</script>' for b in blocks
    )


def faq_html(meta):
    if not meta["faq"]:
        return ""
    items = "\n".join(
        f'<details class="faq-item"><summary>{f["q"]}</summary><div class="faq-a">{f["a"]}</div></details>'
        for f in meta["faq"]
    )
    return f'<section class="faq"><h2>Frequently asked questions</h2>{items}</section>'


# --------------------------------------------------------------------------- #
#  Related tools (internal linking: each tool links to siblings in its category)
# --------------------------------------------------------------------------- #
def related_html(meta, by_cat):
    cat_list = by_cat.get(meta["category"], [])
    if len(cat_list) < 2:
        return ""
    # cyclic pick of the next siblings, so every tool both links to and is
    # linked from a handful of others — spreads internal link equity evenly.
    idx = next((i for i, t in enumerate(cat_list) if t["slug"] == meta["slug"]), 0)
    want = min(6, len(cat_list) - 1)
    picks = [cat_list[(idx + i) % len(cat_list)] for i in range(1, want + 1)]
    cards = "".join(
        f'<a class="card" href="{BASE}/{t["slug"]}/"><h3>{t["title"]}</h3>'
        f'<p>{t["description"]}</p></a>'
        for t in picks
    )
    return (f'<section class="related"><h2>Related tools</h2>'
            f'<div class="grid">{cards}</div></section>')


# --------------------------------------------------------------------------- #
#  Chrome: nav, breadcrumb, footer
# --------------------------------------------------------------------------- #
def nav_html():
    links = [f'<a href="{BASE}/">Home</a>']
    for slug, name in config.CATEGORIES:
        links.append(f'<a href="{BASE}/#{slug}">{name}</a>')
    return "".join(links)


def footer_links():
    pages = [("about", "About"), ("contact", "Contact"),
             ("privacy", "Privacy Policy"), ("disclaimer", "Disclaimer")]
    return " &middot; ".join(f'<a href="{BASE}/{s}/">{n}</a>' for s, n in pages)


def breadcrumb(meta):
    if not meta["category"]:
        return ""
    cat = dict(config.CATEGORIES).get(meta["category"], meta["category"])
    crumbs = (
        f'<nav class="breadcrumb" aria-label="Breadcrumb">'
        f'<a href="{BASE}/">Home</a> &rsaquo; '
        f'<a href="{BASE}/#{meta["category"]}">{cat}</a> &rsaquo; '
        f'<span>{meta["h1"]}</span></nav>'
    )
    bl = {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": config.DOMAIN + BASE + "/"},
            {"@type": "ListItem", "position": 2, "name": cat, "item": f"{config.DOMAIN}{BASE}/#{meta['category']}"},
            {"@type": "ListItem", "position": 3, "name": meta["h1"]},
        ],
    }
    crumbs += f'<script type="application/ld+json">{json.dumps(bl)}</script>'
    return crumbs


# --------------------------------------------------------------------------- #
#  Render one page from the base template
# --------------------------------------------------------------------------- #
TEMPLATE = open(os.path.join(ROOT, "templates", "base.html"), encoding="utf-8").read()


def render(meta, content_html, url):
    out = TEMPLATE
    repl = {
        "TITLE": meta["title"],
        "META_DESCRIPTION": meta["description"].replace('"', "&quot;"),
        "KEYWORDS": meta["keywords"],
        "CANONICAL": url,
        "SITE_NAME": config.SITE_NAME,
        "CONTACT_EMAIL": config.CONTACT_EMAIL,
        "BASE": BASE,
        "NAV": nav_html(),
        "FOOTER_LINKS": footer_links(),
        "BREADCRUMB": breadcrumb(meta),
        "CONTENT": content_html,
        "JSONLD": jsonld(meta, url),
        "ADSENSE_HEAD": adsense_head(),
        "YEAR": str(YEAR),
    }
    # Two passes: the first inserts CONTENT (which may itself contain {{BASE}}
    # / {{CONTACT_EMAIL}} tokens from a page body); the second resolves those.
    for _ in range(2):
        for k, v in repl.items():
            out = out.replace("{{" + k + "}}", v)
    # drop ad markers
    out = out.replace("<!--AD-->", ad_unit())
    return out


def write(slug, html):
    folder = OUT if slug == "index" else os.path.join(OUT, slug)
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)


def url_for(slug):
    return config.DOMAIN + BASE + ("/" if slug == "index" else f"/{slug}/")


# --------------------------------------------------------------------------- #
#  Build
# --------------------------------------------------------------------------- #
def build():
    # fresh output dir
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)

    # static assets
    shutil.copytree(os.path.join(ROOT, "assets"), os.path.join(OUT, "assets"))

    tools = sorted(
        (parse(os.path.join(ROOT, "tools", f))
         for f in os.listdir(os.path.join(ROOT, "tools")) if f.endswith(".html")),
        key=lambda m: m["title"],
    )
    pages = [parse(os.path.join(ROOT, "pages", f))
             for f in os.listdir(os.path.join(ROOT, "pages")) if f.endswith(".html")]

    # group by category once, for related-tool linking
    by_cat = {}
    for m in tools:
        by_cat.setdefault(m["category"], []).append(m)

    # ---- tool pages ----
    for m in tools:
        body = (
            f'<article class="tool"><h1>{m["h1"]}</h1>'
            f'<p class="lede">{m["description"]}</p>'
            f'{m["body"]}'
            f'{faq_html(m)}'
            "</article>"
            f'{related_html(m, by_cat)}'
        )
        write(m["slug"], render(m, body, url_for(m["slug"])))

    # ---- static pages ----
    for m in pages:
        body = f'<article class="page"><h1>{m["h1"]}</h1>{m["body"]}{faq_html(m)}</article>'
        write(m["slug"], render(m, body, url_for(m["slug"])))

    # ---- homepage ----
    write("index", render(home_meta(), home_html(tools), url_for("index")))

    # ---- sitemap / robots / ads.txt / nojekyll / CNAME ----
    extras(tools, pages)

    n = len(tools)
    print(f"Built {n} tool{'s' if n != 1 else ''} + {len(pages)} pages + homepage  ->  docs/")
    if not config.ADSENSE_CLIENT:
        print("   (AdSense disabled -- set ADSENSE_CLIENT in config.py once approved)")


def home_meta():
    return {
        "title": f"{config.SITE_NAME} - {config.SITE_TAGLINE}",
        "description": f"{config.SITE_NAME}: free online mortgage, finance, and everyday "
                       "calculators plus handy random tools. No sign-up, works on any device.",
        "keywords": "free online calculators, mortgage calculator, finance tools",
        "h1": config.SITE_NAME, "category": None, "faq": [],
    }


# A curated set of high-value tools featured at the top of the homepage.
# (Missing slugs are silently skipped, so this list is safe to edit.)
POPULAR = [
    "mortgage-calculator", "rent-vs-buy-calculator", "home-affordability-calculator",
    "mortgage-payoff-calculator", "compound-interest-calculator", "loan-calculator",
    "bmi-calculator", "percentage-calculator",
]


def home_html(tools):
    by_cat = {}
    for m in tools:
        by_cat.setdefault(m["category"], []).append(m)
    by_slug = {m["slug"]: m for m in tools}
    total = len(tools)

    parts = [
        '<section class="hero"><h1>{tagline}</h1>'
        '<p class="lede">{total} simple, free tools that each do one job well — no sign-up, '
        'no clutter, works on your phone.</p>'
        '<input type="search" id="tool-filter" class="filter" placeholder="Search {total} tools…" '
        'aria-label="Search tools"></section>'.format(tagline=config.SITE_TAGLINE, total=total),
        "<!--AD-->",
    ]

    # featured "Popular tools" strip (data-name="" so it hides during a search)
    popular = [by_slug[s] for s in POPULAR if s in by_slug]
    if popular:
        cards = "".join(
            f'<a class="card" href="{BASE}/{m["slug"]}/" data-name="">'
            f'<h3>{m["title"]}</h3><p>{m["description"]}</p></a>'
            for m in popular
        )
        parts.append(
            f'<section class="cat" id="popular"><h2>Popular tools</h2>'
            f'<div class="grid">{cards}</div></section>'
        )

    for slug, name in config.CATEGORIES:
        items = by_cat.get(slug, [])
        if not items:
            continue
        cards = "".join(
            f'<a class="card" href="{BASE}/{m["slug"]}/" data-name="{m["title"].lower()} {m["keywords"].lower()}">'
            f'<h3>{m["title"]}</h3><p>{m["description"]}</p></a>'
            for m in items
        )
        parts.append(
            f'<section class="cat" id="{slug}"><h2>{name} '
            f'<span class="cat-count">{len(items)} tools</span></h2>'
            f'<div class="grid">{cards}</div></section>'
        )
    return "\n".join(parts)


def extras(tools, pages):
    urls = [url_for("index")] + [url_for(m["slug"]) for m in tools] + [url_for(m["slug"]) for m in pages]
    today = date.today().isoformat()
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        sm.append(f"  <url><loc>{u}</loc><lastmod>{today}</lastmod></url>")
    sm.append("</urlset>")
    open(os.path.join(OUT, "sitemap.xml"), "w", encoding="utf-8").write("\n".join(sm))

    open(os.path.join(OUT, "robots.txt"), "w", encoding="utf-8").write(
        "User-agent: *\nAllow: /\n\nSitemap: " + config.DOMAIN + BASE + "/sitemap.xml\n"
    )

    # ads.txt -- required by AdSense once you monetise
    if config.ADSENSE_CLIENT:
        pub = config.ADSENSE_CLIENT.replace("ca-", "")
        open(os.path.join(OUT, "ads.txt"), "w", encoding="utf-8").write(
            f"google.com, {pub}, DIRECT, f08c47fec0942fa0\n"
        )

    open(os.path.join(OUT, ".nojekyll"), "w").write("")

    if config.CUSTOM_DOMAIN:
        open(os.path.join(OUT, "CNAME"), "w", encoding="utf-8").write(config.CUSTOM_DOMAIN + "\n")


if __name__ == "__main__":
    build()
