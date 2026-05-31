# ----------------------------------------------------------------------------
# ToolNest site configuration.  Edit these values, then run:  python build.py
# ----------------------------------------------------------------------------

# Your brand name (shown in the header, titles, footer).
SITE_NAME = "ToolNest"
SITE_TAGLINE = "Free, fast online calculators and tools"

# Your live domain, NO trailing slash. Used for canonical URLs + sitemap.
# Until you buy a domain, leave the placeholder; just remember to change it
# before you submit to Google / AdSense.
DOMAIN = "https://erikthered95.github.io"

# If you deploy to a GitHub *project* page WITHOUT a custom domain, the site
# lives at  https://<user>.github.io/<repo>/  -> set BASE_PATH = "/<repo>".
# If you use a custom domain (recommended) OR a user/org page, leave it "".
BASE_PATH = "/toolnest"

# If you have a custom domain, put the bare host here (e.g. "www.toolnest.com").
# build.py will write docs/CNAME for GitHub Pages. Leave "" if none yet.
CUSTOM_DOMAIN = ""

# Google AdSense publisher ID, e.g. "ca-pub-1234567890123456".
# Leave EMPTY until you are approved -> no ad code is emitted (clean dev site).
# Once set, the loader script is added (this alone powers AdSense "Auto ads").
ADSENSE_CLIENT = ""

# Optional: a single AdSense display-unit slot id (the number from a manual
# ad unit you create in AdSense). If set together with ADSENSE_CLIENT, the
# <!--AD--> markers render real display units. If empty, rely on Auto ads.
AD_SLOT = ""

# Show grey "Ad" placeholder boxes where ads will go (handy for local preview).
# Has no effect once ADSENSE_CLIENT is set.
DEV_AD_PLACEHOLDERS = True

# Contact email shown on the Contact page.
CONTACT_EMAIL = "you@example.com"

# Homepage section order. (slug, display name). Finance leads -- highest value.
CATEGORIES = [
    ("finance",  "Real Estate & Finance"),
    ("everyday", "Everyday Calculators"),
    ("random",   "Word & Random Tools"),
]
