# clonex

A CLI tool to capture live webpages and export clean HTML/CSS, local assets, design tokens, and editable React + Tailwind CSS components.

## Setup

```bash
npm install
```

## Usage

Clone a webpage by passing its URL:

```bash
node bin/clone.js https://example.com
```

Clone and launch a local preview server immediately:

```bash
node bin/clone.js https://example.com --serve
```

Preview an existing cloned directory:

```bash
node bin/clone.js preview ./cloned-sites/example.com --port 4000
```

## Options

- `-o, --output <dir>` — Custom output directory (defaults to `./cloned-sites/<domain>`)
- `-W, --width <number>` — Viewport width in pixels (default: `1440`)
- `-H, --height <number>` — Viewport height in pixels (default: `900`)
- `--wait <ms>` — Extra wait time in ms after scrolling (default: `1500`)
- `--no-scroll` — Disable auto-scrolling before capture
- `--no-assets` — Keep remote URLs instead of downloading assets locally
- `--no-react` — Skip generating the React + Tailwind project
- `--no-verify` — Skip visual screenshot diff verification
- `-s, --serve` — Start a local preview server after cloning
- `-p, --port <number>` — Port for the preview server (default: `4000`)

## Output Structure

For each cloned URL, `clonex` generates:

- `index.html` & `styles.css` — Formatted HTML and unified stylesheet in cascade order
- `single-file.html` — Standalone HTML file with styles inlined
- `design-tokens.json` — Extracted colors, font families, font sizes, and CSS custom properties
- `assets/` — Downloaded images, SVGs, and web fonts (`.woff2`, `.ttf`)
- `react/` — Vite + React + Tailwind project with section components in `src/components/`
- `screenshot-original.png` & `screenshot-clone.png` — Reference and verification screenshots
