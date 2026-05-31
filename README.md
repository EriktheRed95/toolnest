# ToolNest — a static utility-tools site for AdSense income

A zero-dependency static site: a hub of free calculators/tools, built for SEO
and Google AdSense. Pure HTML/CSS/JS output — hosts free on GitHub Pages.

> **The honest part:** building the site is the easy 10%. Getting Google to
> send it traffic (SEO) is the slow 90%, and it usually takes **3–9 months**
> before earnings are meaningful. This repo handles the 10% well and sets you
> up to win the 90%. Treat it as a slow-compounding asset, not a quick flip.

---

## Quick start

```powershell
cd C:\Users\erik9\Documents\toolnest
python build.py                       # generates the docs/ folder
python -m http.server -d docs 8080    # preview at http://localhost:8080
```

Edit, re-run `python build.py`, refresh. That's the whole loop.

## Project layout

```
config.py            # site name, domain, AdSense ID, categories  <-- edit me
build.py             # the generator (stdlib only)
templates/base.html  # the shared page shell (head, header, footer)
assets/              # site.css, site.js, favicon.svg  (copied as-is)
tools/<slug>.html    # ONE FILE PER TOOL  (front-matter + body + inline JS)
pages/<slug>.html    # about / contact / privacy / disclaimer
docs/                # GENERATED OUTPUT — this is what gets published
```

## Add a new tool (the whole point)

Drop a new file in `tools/`, e.g. `tools/loan-payoff-calculator.html`:

```html
<!--META
{
  "title": "Loan Payoff Calculator",
  "slug": "loan-payoff-calculator",
  "category": "finance",
  "h1": "Loan Payoff Calculator",
  "description": "One-sentence summary used for the homepage card + meta description.",
  "keywords": "loan payoff, extra payments, debt calculator",
  "faq": [ {"q": "A question?", "a": "A helpful answer."} ]
}
META-->
<!-- your form markup here -->
<div class="result" id="out"></div>
<script>/* your inline JS here */</script>
<h2>Explainer heading</h2>
<p>A few paragraphs of genuinely useful content (good for SEO + AdSense).</p>
```

`category` must be one of the slugs in `config.CATEGORIES` (`finance`,
`everyday`, `random`). Re-run `python build.py` and it appears on the homepage,
in the sitemap, with its own clean URL `/loan-payoff-calculator/`, SEO tags,
breadcrumbs, and FAQ rich-results markup. Put `<!--AD-->` anywhere to drop an
ad. Reuse the CSS classes already in `assets/site.css` (`.field`, `.row`,
`.btn`, `.result`, `.kv`, `.chip`, `table.amort`…).

**High-value tools to add next** (your real-estate/finance edge — long-tail,
high CPC, weak competition): rent-vs-buy, refinance break-even, mortgage
recast, BRRRR/cash-on-cash, fix-and-flip 70% rule, PMI removal date,
debt-to-income, closing-cost estimator, home affordability, ARM vs fixed.

---

## Deploy to GitHub Pages

1. Create a repo (e.g. `toolnest`) under your GitHub account and push this folder.
   ```powershell
   cd C:\Users\erik9\Documents\toolnest
   git init
   git add .
   git commit -m "Initial ToolNest site"
   git branch -M main
   git remote add origin https://github.com/EriktheRed95/toolnest.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Build and deployment**. Source = *Deploy from
   a branch*; Branch = `main`, folder = `/docs`. Save.
3. Wait ~1 minute. Your site is live at `https://eriktheRed95.github.io/toolnest/`.

   ⚠️ Because that's a *project* page (a subpath), set `BASE_PATH = "/toolnest"`
   in `config.py`, rebuild, and re-push. (A **custom domain** avoids this — see below.)

### Custom domain (strongly recommended before monetizing)
1. Buy a domain (~$10/yr — Cloudflare, Namecheap, Porkbun). Pick something short
   and brandable; `ToolNest` is just a placeholder — rename `SITE_NAME` freely.
2. In `config.py`: set `DOMAIN = "https://www.yourdomain.com"`, `BASE_PATH = ""`,
   `CUSTOM_DOMAIN = "www.yourdomain.com"`. Rebuild + push (writes `docs/CNAME`).
3. At your registrar, point DNS at GitHub Pages (CNAME `www` → `eriktheRed95.github.io`,
   plus the 4 A records for the apex). GitHub's Pages docs list the exact IPs.

---

## Turn on AdSense (after you have content + some traffic)

1. Apply at **adsense.google.com** with your live custom domain. Approval needs
   real content (you have 7 tools + about/contact/privacy — good), and usually
   wants the site to look established. Don't apply with an empty `.github.io` subpath.
2. Once approved, copy your publisher ID (`ca-pub-XXXXXXXXXXXXXXXX`) into
   `config.ADSENSE_CLIENT`. Rebuild + push.
   - That alone enables **Auto ads** (turn them on in the AdSense dashboard —
     Google places ads for you; zero per-page code).
   - For manual control, create a display ad unit in AdSense, paste its slot id
     into `config.AD_SLOT`; the `<!--AD-->` markers become real units.
3. `build.py` writes `docs/ads.txt` automatically once `ADSENSE_CLIENT` is set
   (AdSense requires it).
4. Set `DEV_AD_PLACEHOLDERS = False` for production (it only shows grey boxes
   while you have no real ad client, so you can see the layout locally).

**Realistic earnings:** RPM (revenue per 1,000 pageviews) is roughly **$10–$40**
for finance content, **$2–$8** for word/random tools — both highly variable.
So earnings ≈ (monthly pageviews ÷ 1000) × RPM. The lever that matters is
**traffic**, which means SEO.

---

## The 90%: getting traffic (SEO playbook)

1. **Target keywords people actually search.** Use Google autocomplete, "People
   also ask", and free tools (Google Search Console, Keyword Surfer). Favor
   long-tail, lower-competition phrases where you can rank — that's why the
   niche finance tools beat fighting NerdWallet for "mortgage calculator".
2. **One tool = one page = one keyword.** Already how this site is built.
3. **Write real content** under each tool (you have this) — Google rewards
   substance, and it's required for AdSense.
4. **Submit to Google Search Console** (search.google.com/search-console): add
   your domain, submit `sitemap.xml`. This is how Google finds you.
5. **Get a few links / mentions** — answer relevant questions, share tools where
   appropriate. Slow but it compounds.
6. **Be patient.** New sites sit in a "sandbox" for months. Keep shipping tools;
   10–30 solid tools is where these sites start to gain momentum.

Your unfair advantage: you're a Realtor + finance dev, so you can build and
write *authoritative* real-estate/finance tools that a generalist can't fake.
Lean into that category.
