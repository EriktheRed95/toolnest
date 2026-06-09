# ToolNest — Project Memory / Handoff

> A zero-dependency static site: a hub of free calculators/tools, built for SEO
> and Google AdSense income. Pure HTML/CSS/JS output, hosted free on GitHub Pages.
> Owner's edge: Realtor + finance dev → authoritative real-estate/finance tools.

## Current state (as of this session)

- **86 tools total** — **Finance 45 · Everyday 22 · Random 19** (started the session at 7).
- All work is committed and pushed to branch **`claude/toolnest-status-next-q0egii`**.
- Bundled in **PR #1** → https://github.com/EriktheRed95/toolnest/pull/1 (open, awaiting merge into `main`).
- The live site deploys from **`main` → `/docs`**, so **nothing is live until PR #1 is merged.**
- No CI configured on the repo. Working tree clean.

## Architecture

Zero-dependency Python (stdlib only). Edit a file, run `python build.py`, refresh.

```
config.py            # site name, DOMAIN, BASE_PATH, ADSENSE_CLIENT, categories  <-- edit me
build.py             # the generator (stdlib only)
templates/base.html  # shared page shell (head, header, footer, OG tags)
assets/              # site.css, site.js, favicon.svg (copied as-is)
tools/<slug>.html    # ONE FILE PER TOOL (META front-matter + body + inline JS)
pages/<slug>.html    # about / contact / privacy / disclaimer
docs/                # GENERATED OUTPUT — published by GitHub Pages (do not hand-edit)
```

Build/preview loop:
```
python build.py
python -m http.server -d docs 8080   # http://localhost:8080
```

## How to add a tool

Create `tools/<slug>.html`. Structure (MANDATORY — `build.py` hard-fails on bad META JSON):

1. A `<!--META ... META-->` block of **valid JSON**: keys `title, slug, category, h1,
   description, keywords, faq` (faq = array of 3-4 `{"q","a"}`). `category` is one of
   `finance`, `everyday`, `random` (see `config.CATEGORIES`). `slug` must equal the filename.
2. Form/body HTML using only existing CSS classes: `.row .field .hint .checks .btn
   .btn.secondary .btn-row .result .result-big .result-sub .kv(.v) .note(.note.ok/.note.warn)
   .chip .pw-out .meter .scroll table.amort .lede`.
3. Inline `<script>` vanilla-JS IIFE — no libraries. Currency via
   `new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})`.
   Standard helper: `function kv(k,v){return '<div class="kv"><span>'+k+'</span><span class="v">'+v+'</span></div>';}`.
   Recompute live on input/change. Randomness via `window.crypto.getRandomValues`.
   Copy buttons: `<button class="btn secondary" data-copy="#id">` (global handler in site.js).
4. After the script: an `<h2>` + ~2 paragraphs of genuine SEO content (no "Frequently asked
   questions" heading — the FAQ renders from META automatically). Financial/health tools end
   with a `<p class="note">` "estimate only / not advice" disclaimer.

`build.py` auto-generates: clean URL `/slug/`, SEO meta + canonical, breadcrumbs, JSON-LD
(WebApplication + FAQPage + BreadcrumbList), sitemap entry, a **"Related tools"** section
(cyclically links 6 same-category siblings), homepage card + category count, robots.txt, 404.html.
`<!--AD-->` markers become ad units once AdSense is configured.

## Config status (`config.py`)

- `DOMAIN = "https://erikthered95.github.io"`, `BASE_PATH = "/toolnest"` (GitHub project page).
- `ADSENSE_CLIENT = ""` (empty → no ad code emitted; correct until approved).
- `CUSTOM_DOMAIN = ""` (none yet).
- Categories: `finance` (Real Estate & Finance), `everyday` (Everyday Calculators), `random` (Word & Random Tools).

## Strategy decisions made

- **One site, not split.** With 86 tools the instinct to split into multiple sites was
  considered and **deferred** — domain authority compounds on one domain (cf. Omnicalculator,
  calculator.net). Because every tool carries its `category`, generating separate sites later
  is cheap/reversible. Revisit only with real traffic data; if finance dominates, the strongest
  move is a single dedicated real-estate/finance spin-off (not a 3-way split).
- QR-code generator intentionally **skipped** — would need a third-party lib, breaking the
  zero-dependency architecture.

## Remaining to-dos (priority order)

1. **Merge PR #1** → Pages rebuilds `main`, live in ~1 min at `erikthered95.github.io/toolnest/`.
2. **Verify** the live site (spot-check mortgage, rent-vs-buy, BMI pages).
3. **Submit `sitemap.xml` to Google Search Console** — this starts the (slow, 3-9 month) SEO clock. Highest-leverage next action.
4. **Custom domain** before applying to AdSense (`.github.io` subpaths are weak for approval).
   In `config.py`: set `DOMAIN`, `BASE_PATH=""`, `CUSTOM_DOMAIN`; rebuild writes `docs/CNAME`.
5. **Apply to AdSense** once there's content + some traffic + ideally a custom domain. Then set
   `ADSENSE_CLIENT` (and optionally `AD_SLOT`), rebuild — `build.py` writes `ads.txt` automatically.
6. (Optional) keep adding long-tail tools; finance is the moat.

## Notes for a future session

- Develop on the designated branch; commit + push (the env has a stop-hook that flags untracked files).
- Building tools in bulk worked well via parallel subagents given a precise spec + exact formulas;
  then build centrally, sanity-check math with `node`, fix, commit once.
- All math in existing tools was independently verified this session.
