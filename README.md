# clonex

CLI tool for cloning websites 1:1 (HTML/CSS + React/Tailwind), enumerating subdomains, and scraping pages, API routes, and assets.

## Setup

```bash
git clone https://github.com/HeniMohamedAziz/clonex.git
cd clonex
node bin/clone.js
```

On first run, `clonex` checks for dependencies and Chromium and asks `(Y/N)` to install anything missing.

To run `clonex` from anywhere:

```bash
npm link
```

## Usage

Run `clonex` with no arguments to open the interactive menu, or pass commands directly:

```bash
# interactive menu
clonex

# 1:1 clone a single page
clonex https://example.com

# full recon (subdomains, pages, markdown content, API routes, contacts, files)
clonex recon https://example.com -m 250

# mirror a multi-page site & subdomains for offline browsing
clonex mirror https://example.com -m 25 -s

# serve a cloned folder locally
clonex preview ./cloned-sites/example.com
```

## Output

Captured sites are saved under `./cloned-sites/<domain>/`:

- `DASHBOARD.html` - local offline viewer for browsing scraped data and screenshots
- `01-html-clone/` - 1:1 static HTML/CSS clone, local assets, and `single-file.html`
- `02-react-project/` - Vite + React + Tailwind project
- `03-design-system/` - extracted colors, fonts, CSS variables, and `tailwind.config.js`
- `04-screenshots/` - original, verified clone, and responsive viewport screenshots
- `05-intelligence/` - subdomains, page markdown, API endpoints, links, contacts, forms, and CSV tables
- `06-site-mirror/` - multi-page offline mirror (`SITE-INDEX.html`)
