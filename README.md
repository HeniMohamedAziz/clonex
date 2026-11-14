# clonex

Full-site 1:1 webpage cloner, subdomain & archive hunter, and deep website intelligence scraper.

## Quick Start

```bash
git clone https://github.com/HeniMohamedAziz/clonex.git
cd clonex
node bin/clone.js
```

On first launch, `clonex` automatically checks all required packages and browser engines and prompts `(Y/N)` to install anything missing.

*(Run `npm link` once to launch `clonex` from any directory, or double-click `clonex.bat` on Windows).*

## Modules

1. **1:1 Webpage Clone** — Captures live rendered DOM, CSSOM rules, CSS-in-JS, canvas bitmaps, web fonts, and images, outputting clean HTML/CSS and modular React + Tailwind CSS components with pixel-match verification.
2. **Full Website & Subdomain Mirror** — Crawls an entire website (and optionally all live subdomains), clones every page 1:1 with local assets, downloads discovered PDFs/documents, rewrites internal links for offline multi-page navigation, and generates `SITE-INDEX.html`.
3. **Multi-Viewport Snapshots** — Captures @2x Retina screenshots across Desktop (`1440x900`), Tablet (`768x1024`), and Mobile (`390x844`) viewports.
4. **Total Site Recon & Everything Scraper** — Discovers subdomains (`crt.sh` Certificate Transparency, HackerTarget, Wayback Machine CDX, DNS brute-force), parses `robots.txt` and recursive `sitemap.xml` trees, spiders all pages across hosts, scans JS bundles for hidden API/GraphQL/REST endpoints, and exports:
   - `REPORT.md` & `crawl.json` — Complete intelligence summary
   - `pages.csv` & `pages-full.jsonl` — Every crawled URL, status, title, H1, word count, and metadata
   - `content/<host>/<page>.md` — Clean Markdown text extracted from every page
   - `subdomains.csv` & `subdomains.json` — All discovered subdomains, IPs, status codes, titles, and servers
   - `contacts.csv`, `emails.txt`, `phones.txt`, `socials.json` — Every email, phone number, and social profile across the site
   - `links/` — `internal.txt`, `external.txt`, `external-domains.txt`, `endpoints.txt`, `documents.txt`, `media.txt`, `broken.csv`, `redirects.csv`, `archived.txt`
   - `forms.json` & `tables/*.csv` — All HTML forms/inputs and all HTML tables converted to CSV
   - `graph.json` & `sitemap.generated.xml` — Full internal link graph and generated XML sitemap
5. **Subdomain & Archive Hunter** — Dedicated CT log + DNS brute-force + Wayback CDX enumeration with live HTTP/HTTPS probing and batch subdomain cloning.
6. **Design System & Tokens** — Extracts color palettes, typography, CSS custom properties, and `tailwind.config.js`.
7. **Asset Harvester** — Bulk-downloads images, inline SVGs, and web fonts.
8. **Project Vault & Local Server** — Preview, manage, or serve any captured site locally.

## Direct CLI Commands

```bash
clonex                                      # Launch interactive HUD menu
clonex https://example.com                  # 1:1 clone a single URL
clonex recon https://example.com -m 250     # Full ecosystem recon & everything scraper
clonex mirror https://example.com -m 25 -s  # Multi-page full website & subdomain mirror
clonex preview ./cloned-sites/example.com   # Serve a cloned directory locally
```
