import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function generatePalettePreviewHtml(designTokens, outPath) {
  if (!designTokens) return;
  const colors = designTokens.colors || [];
  const fonts = designTokens.fontFamilies || [];
  const vars = Object.entries(designTokens.cssVariables || {}).slice(0, 80);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Design System // ${escapeHtml(designTokens.url || '')}</title>
  <style>
    * { box-sizing: border-box; }
    body { background: #09090b; color: #f4f4f5; font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 32px; }
    h1 { color: #fbbf24; border-bottom: 2px solid #dc2626; padding-bottom: 12px; margin-top: 0; font-family: ui-monospace, monospace; }
    h2 { color: #00e5ff; font-family: ui-monospace, monospace; font-size: 16px; text-transform: uppercase; letter-spacing: 1px; margin-top: 32px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
    .swatch-card { background: #18181b; border: 1px solid #27272a; border-radius: 8px; overflow: hidden; }
    .swatch-color { height: 84px; border-bottom: 1px solid #27272a; }
    .swatch-info { padding: 10px 12px; font-family: ui-monospace, monospace; font-size: 12px; }
    .chip { display: inline-block; background: #18181b; border: 1px solid #27272a; padding: 8px 14px; border-radius: 6px; margin: 4px; font-family: ui-monospace, monospace; color: #fbbf24; }
    table { width: 100%; border-collapse: collapse; background: #18181b; border: 1px solid #27272a; margin-top: 12px; font-family: ui-monospace, monospace; font-size: 13px; }
    th, td { padding: 8px 12px; border-bottom: 1px solid #27272a; text-align: left; }
    th { background: #7f1d1d; color: #fbbf24; }
  </style>
</head>
<body>
  <h1>◈ CLONEX // DESIGN SYSTEM & TOKENS</h1>
  <p style="color:#a1a1aa;font-family:monospace">Source: ${escapeHtml(designTokens.url || '')}</p>

  <h2>Color Palette (${colors.length})</h2>
  <div class="grid">
    ${colors
      .map(
        (c) => `<div class="swatch-card">
      <div class="swatch-color" style="background:${escapeHtml(c.color)}"></div>
      <div class="swatch-info">
        <div style="color:#fbbf24;font-weight:bold">${escapeHtml(c.color)}</div>
        <div style="color:#71717a;margin-top:4px">${c.count} DOM nodes</div>
      </div>
    </div>`
      )
      .join('')}
  </div>

  <h2>Typography (${fonts.length})</h2>
  <div>${fonts.map((f) => `<span class="chip">${escapeHtml(f)}</span>`).join('')}</div>

  <h2>Border Radii</h2>
  <div>${(designTokens.borderRadii || []).map((r) => `<span class="chip">${escapeHtml(r)}</span>`).join('')}</div>

  ${
    vars.length
      ? `<h2>CSS Custom Properties (${vars.length})</h2>
  <table>
    <thead><tr><th>Variable</th><th>Value</th></tr></thead>
    <tbody>
      ${vars.map(([k, v]) => `<tr><td style="color:#00e5ff">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('')}
    </tbody>
  </table>`
      : ''
  }
</body>
</html>`;

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, html, 'utf-8');
}

export async function updateTargetDashboard(baseOutDir) {
  await fs.mkdir(baseOutDir, { recursive: true });

  const hasHtmlClone = existsSync(path.join(baseOutDir, '01-html-clone', 'index.html'));
  const hasSingleFile = existsSync(path.join(baseOutDir, '01-html-clone', 'single-file.html'));
  const hasReact = existsSync(path.join(baseOutDir, '02-react-project', 'package.json'));
  const hasPaletteHtml = existsSync(path.join(baseOutDir, '03-design-system', 'palette-preview.html'));
  const hasOrigScreen = existsSync(path.join(baseOutDir, '04-screenshots', 'original.png'));
  const hasCloneScreen = existsSync(path.join(baseOutDir, '04-screenshots', 'clone-verified.png'));
  const hasMirror = existsSync(path.join(baseOutDir, '06-site-mirror', 'SITE-INDEX.html'));

  let designTokens = null;
  const tokensPath = path.join(baseOutDir, '03-design-system', 'design-tokens.json');
  if (existsSync(tokensPath)) {
    try {
      designTokens = JSON.parse(await fs.readFile(tokensPath, 'utf-8'));
    } catch {}
  }

  let crawlSummary = null;
  let pagesList = [];
  let subdomainsList = [];

  const crawlJsonPath = path.join(baseOutDir, '05-intelligence', '06-raw-data', 'full-crawl.json');
  const pagesJsonlPath = path.join(baseOutDir, '05-intelligence', '06-raw-data', 'pages-full.jsonl');
  const subsJsonPath = path.join(baseOutDir, '05-intelligence', '01-subdomains', 'subdomains.json');

  if (existsSync(crawlJsonPath)) {
    try {
      crawlSummary = JSON.parse(await fs.readFile(crawlJsonPath, 'utf-8'));
    } catch {}
  }

  if (existsSync(pagesJsonlPath)) {
    try {
      const rawLines = (await fs.readFile(pagesJsonlPath, 'utf-8')).split(/\r?\n/).filter(Boolean);
      pagesList = rawLines.slice(0, 300).map((line) => {
        const p = JSON.parse(line);
        return {
          url: p.url,
          host: p.host,
          path: p.path,
          status: p.status,
          title: p.title || '',
          description: p.description || '',
          h1: p.headings?.h1?.[0] || '',
          wordCount: p.wordCount || 0,
          linksCount: p.links?.length || 0,
          imagesCount: p.images?.length || 0,
          markdown: (p.markdown || p.text || '').slice(0, 15000)
        };
      });
    } catch {}
  }

  if (existsSync(subsJsonPath)) {
    try {
      const rawSubs = JSON.parse(await fs.readFile(subsJsonPath, 'utf-8'));
      subdomainsList = Array.isArray(rawSubs) ? rawSubs : rawSubs.subdomains || [];
    } catch {}
  }

  const responsiveShots = [];
  const respDir = path.join(baseOutDir, '04-screenshots', 'responsive');
  if (existsSync(respDir)) {
    try {
      const files = await fs.readdir(respDir);
      for (const f of files) {
        if (f.endsWith('.png')) responsiveShots.push(`04-screenshots/responsive/${f}`);
      }
    } catch {}
  }

  const rootDomain = crawlSummary?.meta?.rootDomain || path.basename(baseOutDir);
  const allEndpoints = crawlSummary?.aggregate?.endpoints || [];
  const internalEndpoints = [];
  const externalEndpoints = [];

  for (const ep of allEndpoints) {
    try {
      const h = new URL(ep).hostname.toLowerCase();
      if (h === rootDomain || h.endsWith(`.${rootDomain}`)) {
        internalEndpoints.push(ep);
      } else {
        externalEndpoints.push(ep);
      }
    } catch {
      internalEndpoints.push(ep);
    }
  }

  const payload = {
    domain: path.basename(baseOutDir),
    updatedAt: new Date().toISOString(),
    files: {
      htmlClone: hasHtmlClone ? '01-html-clone/index.html' : null,
      singleFile: hasSingleFile ? '01-html-clone/single-file.html' : null,
      reactDir: hasReact ? '02-react-project' : null,
      paletteHtml: hasPaletteHtml ? '03-design-system/palette-preview.html' : null,
      origScreen: hasOrigScreen ? '04-screenshots/original.png' : null,
      cloneScreen: hasCloneScreen ? '04-screenshots/clone-verified.png' : null,
      responsiveShots,
      mirrorIndex: hasMirror ? '06-site-mirror/SITE-INDEX.html' : null,
      reportMd: existsSync(path.join(baseOutDir, '05-intelligence', 'REPORT.md'))
        ? '05-intelligence/REPORT.md'
        : null
    },
    designTokens,
    meta: crawlSummary?.meta || null,
    aggregate: crawlSummary?.aggregate
      ? {
          ...crawlSummary.aggregate,
          internalEndpoints,
          externalEndpoints
        }
      : null,
    subdomains: subdomainsList,
    pages: pagesList
  };

  const safeJson = JSON.stringify(payload).replace(/<\/script/gi, '<\\/script');

  const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CLONEX HUD // ${escapeHtml(payload.domain)}</title>
  <style>
    :root {
      --bg: #09090b;
      --panel: #121216;
      --panel-hover: #1c1c22;
      --border: #27272a;
      --red: #dc2626;
      --bright-red: #ef4444;
      --gold: #f59e0b;
      --bright-gold: #fbbf24;
      --arc: #00e5ff;
      --text: #f4f4f5;
      --muted: #a1a1aa;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      font-size: 14px;
    }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    header {
      background: linear-gradient(90deg, #1a0808 0%, #09090b 60%);
      border-bottom: 2px solid var(--red);
      padding: 20px 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .reactor {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      border: 2px solid var(--arc);
      box-shadow: 0 0 14px rgba(0, 229, 255, 0.45), inset 0 0 8px rgba(0, 229, 255, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--arc);
      font-weight: bold;
      font-size: 18px;
    }
    .title-block h1 {
      margin: 0;
      font-size: 20px;
      letter-spacing: 1.5px;
      color: var(--bright-gold);
    }
    .title-block .sub {
      color: var(--arc);
      font-size: 12px;
      margin-top: 3px;
    }
    .quick-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .btn {
      background: var(--panel);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 14px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 12px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn:hover {
      border-color: var(--bright-gold);
      color: var(--bright-gold);
    }
    .btn-primary {
      background: #7f1d1d;
      border-color: var(--bright-red);
      color: var(--bright-gold);
    }
    .btn-primary:hover {
      background: #991b1b;
    }
    nav.tabs {
      display: flex;
      gap: 4px;
      padding: 0 32px;
      background: #0d0d11;
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--muted);
      padding: 14px 18px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      white-space: nowrap;
      font-family: ui-monospace, monospace;
    }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.active {
      color: var(--bright-gold);
      border-bottom-color: var(--arc);
      background: rgba(0, 229, 255, 0.04);
    }
    main {
      padding: 28px 32px;
      max-width: 1600px;
      margin: 0 auto;
    }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(185px, 1fr));
      gap: 14px;
      margin-bottom: 28px;
    }
    .stat-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-left: 3px solid var(--red);
      border-radius: 6px;
      padding: 14px 16px;
    }
    .stat-card .label {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .stat-card .val {
      color: var(--bright-gold);
      font-size: 24px;
      font-weight: 700;
      margin-top: 6px;
    }
    .stat-card .sub {
      color: var(--arc);
      font-size: 11px;
      margin-top: 4px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .card h2 {
      margin: 0 0 14px 0;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--arc);
      font-family: ui-monospace, monospace;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .folder-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
    }
    .folder-box {
      background: #16161d;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 14px;
    }
    .folder-box .fname {
      color: var(--bright-gold);
      font-weight: 700;
      font-family: ui-monospace, monospace;
      margin-bottom: 6px;
    }
    .folder-box .fdesc {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .chip {
      display: inline-block;
      padding: 5px 10px;
      background: #1c1c24;
      border: 1px solid var(--border);
      border-radius: 4px;
      font-size: 12px;
      margin: 3px;
      font-family: ui-monospace, monospace;
      color: var(--bright-gold);
    }
    .search-bar {
      width: 100%;
      max-width: 420px;
      background: #09090b;
      border: 1px solid var(--border);
      color: var(--text);
      padding: 9px 14px;
      border-radius: 6px;
      margin-bottom: 14px;
      font-family: ui-monospace, monospace;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    th {
      background: #1c1214;
      color: var(--bright-gold);
      font-family: ui-monospace, monospace;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
    tr:hover td { background: var(--panel-hover); }
    a { color: var(--arc); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .badge-ok {
      background: rgba(0, 229, 255, 0.12);
      color: var(--arc);
      padding: 2px 7px;
      border-radius: 4px;
      font-family: ui-monospace, monospace;
      font-size: 11px;
    }
    .badge-dead {
      background: rgba(239, 68, 68, 0.15);
      color: var(--bright-red);
      padding: 2px 7px;
      border-radius: 4px;
      font-family: ui-monospace, monospace;
      font-size: 11px;
    }
    .screens-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
      gap: 18px;
    }
    .screen-box img {
      width: 100%;
      border-radius: 6px;
      border: 1px solid var(--border);
    }
    .swatch-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .swatch {
      width: 120px;
      background: #18181f;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
    }
    .swatch .color-box { height: 48px; }
    .swatch .meta { padding: 6px 8px; font-size: 11px; font-family: ui-monospace, monospace; }
    #reader-modal {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.82);
      z-index: 999;
      padding: 40px;
    }
    #reader-modal .modal-inner {
      max-width: 960px;
      margin: 0 auto;
      background: var(--panel);
      border: 1px solid var(--bright-gold);
      border-radius: 8px;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    #reader-modal .modal-head {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    #reader-modal pre {
      margin: 0;
      padding: 20px;
      overflow: auto;
      flex: 1;
      white-space: pre-wrap;
      line-height: 1.6;
      color: #e4e4e7;
      font-family: ui-monospace, monospace;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="reactor">◈</div>
      <div class="title-block mono">
        <h1 id="hud-domain">CLONEX // HUD</h1>
        <div class="sub" id="hud-sub">STARK-GRADE WEBSITE CLONE & INTELLIGENCE DOSSIER</div>
      </div>
    </div>
    <div class="quick-actions" id="quick-actions"></div>
  </header>

  <nav class="tabs">
    <button class="tab-btn active" data-tab="overview">◈ OVERVIEW & CLONE</button>
    <button class="tab-btn" data-tab="subdomains">▸ SUBDOMAINS & HOSTS</button>
    <button class="tab-btn" data-tab="pages">▸ PAGES & CONTENT READER</button>
    <button class="tab-btn" data-tab="apis">▸ API & ENDPOINTS</button>
    <button class="tab-btn" data-tab="contacts">▸ CONTACTS, SOCIALS & FORMS</button>
    <button class="tab-btn" data-tab="links">▸ LINKS, DOCS & MEDIA</button>
  </nav>

  <main>
    <section id="tab-overview" class="tab-panel active"></section>
    <section id="tab-subdomains" class="tab-panel"></section>
    <section id="tab-pages" class="tab-panel"></section>
    <section id="tab-apis" class="tab-panel"></section>
    <section id="tab-contacts" class="tab-panel"></section>
    <section id="tab-links" class="tab-panel"></section>
  </main>

  <div id="reader-modal">
    <div class="modal-inner">
      <div class="modal-head">
        <strong id="modal-title" class="mono" style="color:var(--bright-gold)">Page Content</strong>
        <button class="btn" onclick="document.getElementById('reader-modal').style.display='none'">✖ CLOSE</button>
      </div>
      <pre id="modal-body"></pre>
    </div>
  </div>

  <script id="clonex-data" type="application/json">${safeJson}</script>
  <script>
    const DATA = JSON.parse(document.getElementById('clonex-data').textContent);
    const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    document.getElementById('hud-domain').textContent = 'CLONEX // ' + DATA.domain.toUpperCase();
    document.getElementById('hud-sub').textContent = 'UPDATED: ' + new Date(DATA.updatedAt).toLocaleString();

    const qa = document.getElementById('quick-actions');
    if (DATA.files.htmlClone) qa.innerHTML += '<a class="btn btn-primary" href="' + DATA.files.htmlClone + '" target="_blank">◈ OPEN 1:1 HTML CLONE</a>';
    if (DATA.files.singleFile) qa.innerHTML += '<a class="btn" href="' + DATA.files.singleFile + '" target="_blank">◈ SINGLE-FILE HTML</a>';
    if (DATA.files.mirrorIndex) qa.innerHTML += '<a class="btn btn-primary" href="' + DATA.files.mirrorIndex + '" target="_blank">◈ FULL SITE MIRROR INDEX</a>';
    if (DATA.files.paletteHtml) qa.innerHTML += '<a class="btn" href="' + DATA.files.paletteHtml + '" target="_blank">◈ DESIGN SYSTEM SHEET</a>';

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      });
    });

    const agg = DATA.aggregate || {};
    const totalWords = (DATA.pages || []).reduce((s, p) => s + (p.wordCount || 0), 0);

    // 1. OVERVIEW TAB
    let ovHtml = '<div class="stats-grid">' +
      '<div class="stat-card"><div class="label">Pages Indexed</div><div class="val mono">' + (DATA.pages?.length || 0) + '</div><div class="sub mono">' + totalWords.toLocaleString() + ' words scraped</div></div>' +
      '<div class="stat-card"><div class="label">Subdomains / Hosts</div><div class="val mono">' + (DATA.subdomains?.length || Object.keys(agg.hosts || {}).length || 1) + '</div><div class="sub mono">' + (DATA.subdomains?.filter(s=>s.alive).length || Object.keys(agg.hosts || {}).length || 1) + ' live HTTP/HTTPS</div></div>' +
      '<div class="stat-card"><div class="label">Target API Routes</div><div class="val mono">' + (agg.internalEndpoints?.length || 0) + '</div><div class="sub mono">+' + (agg.externalEndpoints?.length || 0) + ' third-party</div></div>' +
      '<div class="stat-card"><div class="label">Contacts & Socials</div><div class="val mono">' + ((agg.emails?.length || 0) + (agg.phones?.length || 0) + (agg.socials?.length || 0)) + '</div><div class="sub mono">' + (agg.emails?.length || 0) + ' emails | ' + (agg.phones?.length || 0) + ' phones</div></div>' +
      '<div class="stat-card"><div class="label">Forms & Tables</div><div class="val mono">' + ((agg.forms?.length || 0) + (agg.tables?.length || 0)) + '</div><div class="sub mono">' + (agg.forms?.length || 0) + ' forms | ' + (agg.tables?.length || 0) + ' tables</div></div>' +
      '<div class="stat-card"><div class="label">Media & Docs</div><div class="val mono">' + ((agg.media?.length || 0) + (agg.documents?.length || 0)) + '</div><div class="sub mono">' + (agg.documents?.length || 0) + ' docs | ' + (agg.media?.length || 0) + ' media</div></div>' +
    '</div>';

    ovHtml += '<div class="card"><h2>Organized Folder Map</h2><div class="folder-grid">' +
      '<div class="folder-box"><div class="fname">01-html-clone/</div><div class="fdesc">1:1 static HTML + unified CSS + local fonts/images + portable single-file.html</div></div>' +
      '<div class="folder-box"><div class="fname">02-react-project/</div><div class="fdesc">Runnable Vite + React + Tailwind project with modular JSX components</div></div>' +
      '<div class="folder-box"><div class="fname">03-design-system/</div><div class="fdesc">Extracted colors, typography, CSS variables, tailwind.config.js & palette sheet</div></div>' +
      '<div class="folder-box"><div class="fname">04-screenshots/</div><div class="fdesc">Original vs Cloned verification screenshots & responsive Desktop/Tablet/Mobile shots</div></div>' +
      '<div class="folder-box"><div class="fname">05-intelligence/</div><div class="fdesc">Subdomains, Markdown content per page, APIs, links, contacts, forms & CSV tables</div></div>' +
      (DATA.files.mirrorIndex ? '<div class="folder-box"><div class="fname">06-site-mirror/</div><div class="fdesc">Multi-page offline website clone with rewritten cross-page navigation</div></div>' : '') +
    '</div></div>';

    if (agg.tech && agg.tech.length) {
      ovHtml += '<div class="card"><h2>Detected Technology Stack</h2><div>' +
        agg.tech.map(t => '<span class="chip">' + esc(t.name) + ' (' + t.pages + ')</span>').join('') +
      '</div></div>';
    }

    if (DATA.designTokens && DATA.designTokens.colors && DATA.designTokens.colors.length) {
      ovHtml += '<div class="card"><h2>Extracted Color Palette & Typography</h2><div class="swatch-row">' +
        DATA.designTokens.colors.slice(0, 12).map(c =>
          '<div class="swatch"><div class="color-box" style="background:' + esc(c.color) + '"></div><div class="meta"><div style="color:var(--bright-gold)">' + esc(c.color) + '</div><div style="color:var(--muted)">' + c.count + ' nodes</div></div></div>'
        ).join('') +
      '</div></div>';
    }

    if (DATA.files.origScreen || DATA.files.cloneScreen) {
      ovHtml += '<div class="card"><h2>1:1 Visual Verification Screenshots</h2><div class="screens-row">' +
        (DATA.files.origScreen ? '<div class="screen-box"><div class="mono" style="margin-bottom:8px;color:var(--muted)">ORIGINAL LIVE CAPTURE</div><a href="' + DATA.files.origScreen + '" target="_blank"><img src="' + DATA.files.origScreen + '" /></a></div>' : '') +
        (DATA.files.cloneScreen ? '<div class="screen-box"><div class="mono" style="margin-bottom:8px;color:var(--arc)">LOCAL 1:1 CLONE VERIFICATION</div><a href="' + DATA.files.cloneScreen + '" target="_blank"><img src="' + DATA.files.cloneScreen + '" /></a></div>' : '') +
      '</div></div>';
    }
    document.getElementById('tab-overview').innerHTML = ovHtml;

    // 2. SUBDOMAINS TAB
    const subs = DATA.subdomains || [];
    let subHtml = '<div class="card"><h2>Discovered Subdomains & Hosts (' + subs.length + ')</h2>' +
      '<table><thead><tr><th>#</th><th>Status</th><th>Hostname</th><th>Title</th><th>IPs</th><th>Server</th><th>Sources</th></tr></thead><tbody>' +
      (subs.length ? subs.map((s, i) => '<tr>' +
        '<td class="mono">' + (i + 1) + '</td>' +
        '<td>' + (s.alive ? '<span class="badge-ok">' + (s.status || 200) + '</span>' : '<span class="badge-dead">DEAD</span>') + '</td>' +
        '<td class="mono"><a href="' + esc(s.url || ('https://' + s.host)) + '" target="_blank">' + esc(s.host) + '</a></td>' +
        '<td>' + esc(s.title || '') + '</td>' +
        '<td class="mono" style="color:var(--muted)">' + esc((s.ips || []).join(', ')) + '</td>' +
        '<td class="mono">' + esc(s.server || '') + '</td>' +
        '<td class="mono" style="color:var(--bright-gold)">' + esc((s.sources || []).join(', ')) + '</td>' +
      '</tr>').join('') : '<tr><td colspan="7">Run Total Site Recon or Subdomain Hunter to populate subdomains.</td></tr>') +
      '</tbody></table></div>';
    document.getElementById('tab-subdomains').innerHTML = subHtml;

    // 3. PAGES & CONTENT READER TAB
    window.openPageReader = function(idx) {
      const p = DATA.pages[idx];
      if (!p) return;
      document.getElementById('modal-title').textContent = (p.title || p.url) + ' (' + p.url + ')';
      document.getElementById('modal-body').textContent = p.markdown || 'No text content on this page.';
      document.getElementById('reader-modal').style.display = 'block';
    };

    const renderPagesTable = (filter = '') => {
      const q = filter.toLowerCase();
      const rows = (DATA.pages || []).map((p, idx) => ({ p, idx })).filter(({ p }) =>
        !q || p.url.toLowerCase().includes(q) || (p.title || '').toLowerCase().includes(q) || (p.h1 || '').toLowerCase().includes(q)
      );
      return '<table><thead><tr><th>#</th><th>Status</th><th>URL</th><th>Title / H1</th><th>Words</th><th>Content</th></tr></thead><tbody>' +
        (rows.length ? rows.map(({ p, idx }) => '<tr>' +
          '<td class="mono">' + (idx + 1) + '</td>' +
          '<td><span class="badge-ok">' + (p.status || 200) + '</span></td>' +
          '<td class="mono"><a href="' + esc(p.url) + '" target="_blank">' + esc(p.url) + '</a></td>' +
          '<td><strong>' + esc(p.title || '') + '</strong>' + (p.h1 ? '<div style="color:var(--muted);font-size:12px">H1: ' + esc(p.h1) + '</div>' : '') + '</td>' +
          '<td class="mono">' + (p.wordCount || 0) + '</td>' +
          '<td><button class="btn" onclick="openPageReader(' + idx + ')">◈ READ TEXT</button></td>' +
        '</tr>').join('') : '<tr><td colspan="6">No matching pages found.</td></tr>') +
        '</tbody></table>';
    };

    document.getElementById('tab-pages').innerHTML =
      '<div class="card"><h2>Crawled Pages & Extracted Content (' + (DATA.pages?.length || 0) + ')</h2>' +
      '<input class="search-bar" id="page-search" placeholder="Filter pages by URL, title or heading..." />' +
      '<div id="pages-table-wrap">' + renderPagesTable() + '</div></div>';

    document.getElementById('page-search')?.addEventListener('input', (e) => {
      document.getElementById('pages-table-wrap').innerHTML = renderPagesTable(e.target.value);
    });

    // 4. APIS TAB
    const intEps = agg.internalEndpoints || [];
    const extEps = agg.externalEndpoints || [];
    document.getElementById('tab-apis').innerHTML =
      '<div class="card"><h2>Target Domain & Subdomain API / Data Routes (' + intEps.length + ')</h2>' +
      '<table><thead><tr><th>#</th><th>Endpoint URL</th></tr></thead><tbody>' +
      (intEps.length ? intEps.map((u, i) => '<tr><td class="mono">' + (i + 1) + '</td><td class="mono"><a href="' + esc(u) + '" target="_blank">' + esc(u) + '</a></td></tr>').join('') : '<tr><td colspan="2">None detected.</td></tr>') +
      '</tbody></table></div>' +
      '<div class="card"><h2>Third-Party Service Endpoints (' + extEps.length + ')</h2>' +
      '<table><thead><tr><th>#</th><th>External Endpoint</th></tr></thead><tbody>' +
      (extEps.length ? extEps.map((u, i) => '<tr><td class="mono">' + (i + 1) + '</td><td class="mono"><a href="' + esc(u) + '" target="_blank">' + esc(u) + '</a></td></tr>').join('') : '<tr><td colspan="2">None detected.</td></tr>') +
      '</tbody></table></div>';

    // 5. CONTACTS, SOCIALS & FORMS TAB
    document.getElementById('tab-contacts').innerHTML =
      '<div class="card"><h2>Emails (' + (agg.emails?.length || 0) + ') & Phones (' + (agg.phones?.length || 0) + ')</h2>' +
      '<table><thead><tr><th>Type</th><th>Value</th><th>Occurrences</th><th>Found On</th></tr></thead><tbody>' +
      [...(agg.emails || []).map(e => ({ type: 'EMAIL', ...e })), ...(agg.phones || []).map(p => ({ type: 'PHONE', ...p }))].map(item =>
        '<tr><td class="mono" style="color:var(--bright-gold)">' + item.type + '</td><td class="mono">' + esc(item.value) + '</td><td class="mono">' + item.count + '</td><td class="mono" style="color:var(--muted)">' + esc((item.pages || []).slice(0, 3).join(', ')) + '</td></tr>'
      ).join('') +
      '</tbody></table></div>' +
      '<div class="card"><h2>Social Media Profiles (' + (agg.socials?.length || 0) + ')</h2>' +
      '<table><thead><tr><th>Platform</th><th>Profile URL</th></tr></thead><tbody>' +
      (agg.socials || []).map(s => '<tr><td class="mono" style="color:var(--bright-gold)">' + esc(s.platform) + '</td><td class="mono"><a href="' + esc(s.url) + '" target="_blank">' + esc(s.url) + '</a></td></tr>').join('') +
      '</tbody></table></div>' +
      '<div class="card"><h2>HTML Forms Detected (' + (agg.forms?.length || 0) + ')</h2>' +
      '<table><thead><tr><th>Method</th><th>Action</th><th>Page</th><th>Input Fields</th></tr></thead><tbody>' +
      (agg.forms || []).map(f => '<tr><td class="mono"><span class="badge-ok">' + esc(f.method) + '</span></td><td class="mono">' + esc(f.action) + '</td><td class="mono">' + esc(f.page) + '</td><td class="mono" style="color:var(--bright-gold)">' + esc((f.fields || []).map(x => x.name || x.type).join(', ')) + '</td></tr>').join('') +
      '</tbody></table></div>';

    // 6. LINKS, DOCS & MEDIA TAB
    document.getElementById('tab-links').innerHTML =
      '<div class="card"><h2>Documents & Files (' + (agg.documents?.length || 0) + ')</h2>' +
      '<table><thead><tr><th>#</th><th>Document URL</th></tr></thead><tbody>' +
      ((agg.documents || []).length ? agg.documents.map((d, i) => '<tr><td class="mono">' + (i + 1) + '</td><td class="mono"><a href="' + esc(d.url) + '" target="_blank">' + esc(d.url) + '</a></td></tr>').join('') : '<tr><td colspan="2">No document links detected.</td></tr>') +
      '</tbody></table></div>' +
      '<div class="card"><h2>Top External Outbound Domains (' + (agg.externalDomains?.length || 0) + ')</h2>' +
      '<table><thead><tr><th>Domain</th><th>Link Count</th></tr></thead><tbody>' +
      (agg.externalDomains || []).slice(0, 60).map(d => '<tr><td class="mono" style="color:var(--bright-gold)">' + esc(d.domain) + '</td><td class="mono">' + d.count + '</td></tr>').join('') +
      '</tbody></table></div>' +
      '<div class="card"><h2>External Outbound URLs (' + (agg.externalLinks?.length || 0) + ')</h2>' +
      '<table><thead><tr><th>URL</th><th>Anchor Text</th><th>Count</th></tr></thead><tbody>' +
      (agg.externalLinks || []).slice(0, 150).map(e => '<tr><td class="mono"><a href="' + esc(e.url) + '" target="_blank">' + esc(e.url) + '</a></td><td>' + esc(e.text || '') + '</td><td class="mono">' + e.count + '</td></tr>').join('') +
      '</tbody></table></div>';
  </script>
</body>
</html>`;

  const dashboardPath = path.join(baseOutDir, 'DASHBOARD.html');
  await fs.writeFile(dashboardPath, dashboardHtml, 'utf-8');
  return dashboardPath;
}
