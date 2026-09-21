# ToolNest — Project Memory / Handoff

> A zero-dependency static site: a hub of free calculators/tools, built for SEO
> and Google AdSense income. Pure HTML/CSS/JS output, hosted free on GitHub Pages.
> Owner's edge: Realtor + finance dev → authoritative real-estate/finance tools.

## Current state (September 20, 2026)

- 86 tools: Finance 45, Everyday 22, Random 19.
- Public site: https://erikthered95.github.io/toolnest/ . GitHub Pages serves main /docs.
- PR #1 was already merged; no merge remains pending.
- Reviewed calculator fixes and generated pages are included in this release. No advertising is enabled and no contact identity is invented.
- Tests cover the repaired subset, not independent certification of all 86 calculators.

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

## Verification and next work

Edit tools/pages and rebuild with `python build.py`; generated docs must travel with source changes.
Run `python audit_static.py` for links, labels and duplicate IDs.
Focused tests: `node test-date-fraction.cjs`, `node test-date-review.cjs`, `node test-age.cjs`, `node test-work-hours.cjs`, `node test-health.cjs`, `node test-browser-dependent.cjs`, `node test-recast.cjs`, `node test-realestate.cjs`.

September 20 review fixed date/DST/month-end arithmetic, exact fractions, age breakdown, work-hours output, health input/scope handling, hash races, debt/GPA behavior and real-estate calculator boundaries. Claude implemented the date/fraction subset; Codex independently reviewed it and fixed a remaining year-zero edge. Earlier Claude connection failure applied to the earlier seven-tool pass only.

Remaining: continue formula/source audits, choose real publisher/contact details, set up Search Console, and decide on optional domain/advertising after eligibility checks. No claim of revenue, traffic or complete mathematical certification.

User preference: delegate heavier implementation/research to Claude when available, with independent Codex review and meaningful tests. Keep local agent transcripts, review runners and private runtime material out of the public repository.
