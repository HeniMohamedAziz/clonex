# clonex

Full-site 1:1 webpage cloner, subdomain & archive hunter, and deep website intelligence scraper.

## Quick Start

```bash
git clone https://github.com/HeniMohamedAziz/clonex.git
cd clonex
node bin/clone.js
```

On first launch, `clonex` checks all required packages and browser engines and prompts `(Y/N)` to install anything missing.

*(Run `npm link` once to launch `clonex` from any directory, or double-click `clonex.bat` on Windows).*

## Output Structure

Every target inside `./cloned-sites/<domain>/` is organized into numbered folders alongside a standalone offline viewer (`DASHBOARD.html`) that opens directly in any browser without needing a server:

```text
cloned-sites/<domain>/
├── DASHBOARD.html                      # Interactive offline HUD viewer (Overview, Subdomains, Pages, Content Reader, APIs, Contacts)
├── 01-html-clone/                      # 1:1 visual clone (index.html, styles.css, single-file.html, assets/)
├── 02-react-project/                   # Ready-to-run Vite + React + Tailwind CSS project
├── 03-design-system/                   # design-tokens.json, tailwind.config.js, palette-preview.html
├── 04-screenshots/                     # original.png, clone-verified.png, responsive/
├── 05-intelligence/                    # Full reconnaissance & scraped data
│   ├── REPORT.md                       # Formatted Markdown summary report
│   ├── 01-subdomains/                  # subdomains.csv, subdomains.json, wayback-archive-urls.txt
│   ├── 02-pages-and-content/           # pages-summary.csv, sitemap.xml, markdown-by-host/<host>/*.md
│   ├── 03-apis-and-links/              # internal-api-endpoints.txt, third-party-endpoints.txt, internal-pages.txt, external-links.txt, documents-and-files.txt
│   ├── 04-contacts-and-forms/          # contacts-and-socials.csv, emails.txt, phones.txt, socials.json, forms.json
│   ├── 05-tables-and-structured-data/  # tech-stack.json, tables/*.csv
│   └── 06-raw-data/                    # full-crawl.json, pages-full.jsonl, link-graph.json
└── 06-site-mirror/                     # Multi-page full website & subdomain offline mirror (SITE-INDEX.html)
```

## Direct CLI Commands

```bash
clonex                                      # Launch interactive HUD menu
clonex https://example.com                  # 1:1 clone a single URL
clonex recon https://example.com -m 250     # Full ecosystem recon & everything scraper
clonex mirror https://example.com -m 25 -s  # Multi-page full website & subdomain mirror
clonex preview ./cloned-sites/example.com   # Serve a cloned directory locally
```
