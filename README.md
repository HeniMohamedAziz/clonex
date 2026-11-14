# clonex

CLI tool to clone websites 1:1, mirror full multi-page sites offline, enumerate subdomains, and scrape site data.

## Features

- **1:1 Webpage Clone**: Renders pages in headless Chromium, extracts the live DOM and CSSOM rules (including CSS-in-JS and Tailwind), downloads images/fonts/SVGs locally, and generates both static HTML/CSS and a Vite + React + Tailwind project.
- **Full Site & Subdomain Mirror**: Crawls internal routes and live subdomains, clones every page 1:1, downloads discovered documents, and rewrites links for offline navigation.
- **Total Site Recon**: Discovers subdomains via Certificate Transparency (`crt.sh`), passive DNS, Wayback Machine archives, and DNS brute-forcing. Crawls all pages, extracts page text to Markdown, scans JS bundles for API endpoints, and collects emails, phone numbers, social links, forms, and CSV tables.
- **Design Tokens & Assets**: Extracts color palettes, typography, CSS variables, `tailwind.config.js`, and responsive screenshots across Desktop, Tablet, and Mobile viewports.

## Run

```bash
node bin/clone.js
```

On first launch, `clonex` checks for required packages and Chromium and prompts `(Y/N)` to install anything missing. Run `npm link` to use `clonex` globally from any terminal.

## CLI

```bash
clonex
clonex https://example.com
clonex recon https://example.com -m 250
clonex mirror https://example.com -m 25 -s
clonex preview ./cloned-sites/example.com
```

All outputs are saved under `./cloned-sites/<domain>/` with an offline `DASHBOARD.html` viewer.
