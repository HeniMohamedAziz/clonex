# clonex

Interactive CLI suite to capture live webpages, extract design tokens, harvest assets, and export 1:1 HTML/CSS and React/Tailwind components.

## Setup

```bash
npm install
npm link
```

## Interactive Menu

Run `clonex` (or `npm start` / `.\clonex.bat`) to launch the interactive menu:

```bash
clonex
```

### Built-in Modules

- **[1] Clone Webpage (1:1 Design Capture)** — Full suite (HTML/CSS + React/Tailwind + local assets + visual fidelity verification), HTML-only, or mobile viewport presets
- **[2] Multi-Viewport Responsive Snapshots** — Desktop (`1440x900`), Tablet (`768x1024`), and Mobile (`390x844`) retina screenshots
- **[3] Design System & Tailwind Extractor** — Extract color palettes, typography, CSS custom properties, and `tailwind.config.js`
- **[4] Asset Harvester (Images, SVGs & Fonts)** — Scrape and organize all images, inline SVGs, and `.woff2`/`.ttf` web fonts
- **[5] Browse & Preview Cloned Sites** — Start a local preview server, open project folders in Explorer, or manage cloned sites
- **[6] Engine Settings & Defaults** — Configure default viewport dimensions, wait time, scroll behavior, and preview server port

## Direct CLI Usage

You can also pass a URL directly from the terminal:

```bash
clonex https://example.com
clonex https://example.com --serve
clonex preview ./cloned-sites/example.com --port 4000
```

## Adding New Modules

Each tool lives in `src/modules/` and is registered in `src/modules/index.js`:

```js
export const myNewModule = {
  id: 'my-module',
  category: 'Custom Tools',
  title: 'My Custom Tool',
  description: 'Short description shown in the menu',
  async run(context) {
    // Module logic here
  }
};
```
