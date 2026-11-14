# clonex

Interactive CLI toolkit to clone live webpages 1:1, extract all site pages/links and website intelligence, capture responsive screenshots, harvest assets, and export clean HTML/CSS and React/Tailwind components.

## Installation

```bash
git clone https://github.com/HeniMohamedAziz/clonex.git
cd clonex
npm install
npm link
```

## Quick Start

Launch the interactive menu from any terminal:

```bash
clonex
```

*(On Windows, you can also run `.\clonex.bat` or `npm start`).*

## Features

1. **Clone Webpage (1:1 Design Capture)** — Captures rendered DOM, CSSOM rules, CSS-in-JS, canvas graphics, web fonts, and images, outputting formatted HTML/CSS and modular React + Tailwind CSS components with pixel-match verification.
2. **Website Intelligence, Links & Pages Extractor** — Extracts all internal pages/routes, `sitemap.xml` & `robots.txt` entries, external outbound links, XHR/API endpoints, forms, social profiles, emails/phones, SEO/OpenGraph metadata, and detected tech stack, with an option to deep-spider or batch-clone discovered pages.
3. **Multi-Viewport Responsive Snapshots** — Captures @2x Retina screenshots across Desktop (`1440x900`), Tablet (`768x1024`), and Mobile (`390x844`) viewports.
4. **Design System & Tailwind Extractor** — Extracts color palettes, font families, CSS custom properties, and generates a ready-to-use `tailwind.config.js`.
5. **Asset Harvester (Images, SVGs & Fonts)** — Downloads all high-res images, inline SVG vectors, and `.woff2`/`.ttf` web fonts into organized folders.
6. **Browse & Preview Cloned Sites** — Built-in local server and project manager to preview or manage your captured sites.

## Direct CLI Usage

```bash
clonex https://example.com
clonex https://example.com --serve
clonex preview ./cloned-sites/example.com --port 4000
```
