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
  <title>Tokens / ${escapeHtml(designTokens.url || '')}</title>
  <style>
    * { box-sizing: border-box; }
    body { background: #0b0b0d; color: #e4e4e7; font-family: Consolas, ui-monospace, monospace; font-size: 13px; margin: 0; padding: 24px 32px; }
    header { border-bottom: 1px solid #dc2626; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: baseline; }
    h1 { color: #f59e0b; font-size: 15px; margin: 0; font-weight: 600; }
    h2 { color: #f59e0b; font-size: 12px; text-transform: uppercase; margin: 24px 0 10px; letter-spacing: 0.5px; }
    .swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
    .swatch { background: #121216; border: 1px solid #222228; }
    .swatch-box { height: 52px; border-bottom: 1px solid #222228; }
    .swatch-meta { padding: 6px 8px; font-size: 11px; }
    .tag { display: inline-block; background: #121216; border: 1px solid #222228; padding: 4px 10px; margin: 0 6px 6px 0; color: #06b6d4; }
    table { width: 100%; border-collapse: collapse; background: #121216; border: 1px solid #222228; }
    th, td { padding: 6px 10px; border-bottom: 1px solid #1c1c22; text-align: left; }
    th { color: #f59e0b; background: #161112; font-weight: 600; }
  </style>
</head>
<body>
  <header>
    <h1>CLONEX // DESIGN TOKENS</h1>
    <span style="color:#71717a">${escapeHtml(designTokens.url || '')}</span>
  </header>

  <h2>Colors (${colors.length})</h2>
  <div class="swatches">
    ${colors
      .map(
        (c) => `<div class="swatch">
      <div class="swatch-box" style="background:${escapeHtml(c.color)}"></div>
      <div class="swatch-meta">
        <div style="color:#e4e4e7">${escapeHtml(c.color)}</div>
        <div style="color:#71717a">${c.count}x</div>
      </div>
    </div>`
      )
      .join('')}
  </div>

  <h2>Fonts (${fonts.length})</h2>
  <div>${fonts.map((f) => `<span class="tag">${escapeHtml(f)}</span>`).join('')}</div>

  ${
    vars.length
      ? `<h2>CSS Variables (${vars.length})</h2>
  <table>
    <thead><tr><th>Name</th><th>Value</th></tr></thead>
    <tbody>
      ${vars.map(([k, v]) => `<tr><td style="color:#06b6d4">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('')}
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
          h1: p.headings?.h1?.[0] || '',
          wordCount: p.wordCount || 0,
          markdown: (p.markdown || p.text || '').slice(0, 12000)
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
    files: {
      htmlClone: hasHtmlClone ? '01-html-clone/index.html' : null,
      singleFile: hasSingleFile ? '01-html-clone/single-file.html' : null,
      paletteHtml: hasPaletteHtml ? '03-design-system/palette-preview.html' : null,
      origScreen: hasOrigScreen ? '04-screenshots/original.png' : null,
      cloneScreen: hasCloneScreen ? '04-screenshots/clone-verified.png' : null,
      mirrorIndex: hasMirror ? '06-site-mirror/SITE-INDEX.html' : null
    },
    designTokens,
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
  <title>clonex // ${escapeHtml(payload.domain)}</title>
  <style>
    :root {
      --bg: #0b0b0d;
      --surface: #121216;
      --border: #222228;
      --red: #dc2626;
      --gold: #f59e0b;
      --cyan: #06b6d4;
      --text: #e4e4e7;
      --muted: #71717a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Consolas, 'JetBrains Mono', ui-monospace, monospace;
      font-size: 13px;
      line-height: 1.45;
    }
    a { color: var(--cyan); text-decoration: none; }
    a:hover { text-decoration: underline; }
    header {
      padding: 14px 24px;
      border-bottom: 1px solid var(--red);
      background: #0e0e12;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .brand { display: flex; align-items: baseline; gap: 14px; }
    .brand strong { color: var(--gold); font-size: 15px; letter-spacing: 0.5px; }
    .brand span { color: var(--muted); font-size: 12px; }
    .links { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 5px 10px;
      font-family: inherit;
      font-size: 12px;
      cursor: pointer;
    }
    .btn:hover { border-color: var(--gold); color: var(--gold); text-decoration: none; }
    .btn-red { border-color: var(--red); color: var(--gold); }
    nav {
      display: flex;
      padding: 0 24px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
    }
    .tab {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--muted);
      padding: 10px 14px;
      font-family: inherit;
      font-size: 12px;
      cursor: pointer;
    }
    .tab:hover { color: var(--text); }
    .tab.active { color: var(--gold); border-bottom-color: var(--red); }
    main { padding: 20px 24px; max-width: 1480px; margin: 0 auto; }
    .panel { display: none; }
    .panel.active { display: block; }
    .summary-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 24px;
      padding: 12px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-left: 3px solid var(--red);
      margin-bottom: 18px;
    }
    .metric span { color: var(--muted); font-size: 11px; display: block; }
    .metric strong { color: var(--gold); font-size: 16px; }
    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(460px, 1fr)); gap: 18px; }
    .box {
      background: var(--surface);
      border: 1px solid var(--border);
      margin-bottom: 18px;
    }
    .box-head {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      color: var(--gold);
      font-size: 12px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .box-body { padding: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 7px 10px; border-bottom: 1px solid #1a1a20; text-align: left; vertical-align: top; }
    th { color: var(--muted); font-weight: 600; background: #0f0f13; }
    tr:hover td { background: #16161c; }
    input.filter {
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 5px 10px;
      font-family: inherit;
      font-size: 12px;
      width: 280px;
    }
    .tag {
      display: inline-block;
      border: 1px solid var(--border);
      padding: 2px 7px;
      margin: 2px;
      font-size: 11px;
      color: var(--text);
    }
    .swatches { display: flex; flex-wrap: wrap; gap: 6px; }
    .swatch {
      display: flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--border);
      padding: 3px 7px;
      font-size: 11px;
    }
    .dot { width: 12px; height: 12px; border: 1px solid #333; }
    .shots { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .shots img { width: 100%; border: 1px solid var(--border); display: block; }
    pre.reader {
      background: var(--bg);
      border: 1px solid var(--border);
      padding: 12px;
      white-space: pre-wrap;
      margin: 6px 0 0;
      max-height: 360px;
      overflow: auto;
      color: #d4d4d8;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <strong id="title">CLONEX</strong>
      <span id="subtitle"></span>
    </div>
    <div class="links" id="actions"></div>
  </header>

  <nav id="tabs">
    <button class="tab active" data-tab="overview">Overview</button>
    <button class="tab" data-tab="subdomains" id="tab-btn-subs">Subdomains</button>
    <button class="tab" data-tab="pages" id="tab-btn-pages">Pages</button>
    <button class="tab" data-tab="apis" id="tab-btn-apis">API & Endpoints</button>
    <button class="tab" data-tab="contacts" id="tab-btn-contacts">Contacts & Forms</button>
    <button class="tab" data-tab="links">Links & Files</button>
  </nav>

  <main>
    <div id="panel-overview" class="panel active"></div>
    <div id="panel-subdomains" class="panel"></div>
    <div id="panel-pages" class="panel"></div>
    <div id="panel-apis" class="panel"></div>
    <div id="panel-contacts" class="panel"></div>
    <div id="panel-links" class="panel"></div>
  </main>

  <script id="clonex-data" type="application/json">${safeJson}</script>
  <script>
    const D = JSON.parse(document.getElementById('clonex-data').textContent);
    const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const agg = D.aggregate || {};
    const subs = D.subdomains || [];
    const pages = D.pages || [];
    const intEps = agg.internalEndpoints || [];
    const extEps = agg.externalEndpoints || [];
    const words = pages.reduce((a, p) => a + (p.wordCount || 0), 0);

    document.getElementById('title').textContent = 'CLONEX // ' + D.domain;
    document.getElementById('subtitle').textContent = pages.length + ' pages · ' + (subs.length || 1) + ' hosts · ' + intEps.length + ' routes';

    if (subs.length) document.getElementById('tab-btn-subs').textContent = 'Subdomains (' + subs.length + ')';
    if (pages.length) document.getElementById('tab-btn-pages').textContent = 'Pages (' + pages.length + ')';
    if (intEps.length) document.getElementById('tab-btn-apis').textContent = 'API & Endpoints (' + intEps.length + ')';
    const cCount = (agg.emails?.length || 0) + (agg.phones?.length || 0) + (agg.socials?.length || 0);
    if (cCount) document.getElementById('tab-btn-contacts').textContent = 'Contacts & Forms (' + cCount + ')';

    const act = document.getElementById('actions');
    if (D.files.htmlClone) act.innerHTML += '<a class="btn btn-red" href="' + D.files.htmlClone + '" target="_blank">Open 1:1 Clone</a>';
    if (D.files.singleFile) act.innerHTML += '<a class="btn" href="' + D.files.singleFile + '" target="_blank">Single-File HTML</a>';
    if (D.files.mirrorIndex) act.innerHTML += '<a class="btn btn-red" href="' + D.files.mirrorIndex + '" target="_blank">Site Mirror</a>';
    if (D.files.paletteHtml) act.innerHTML += '<a class="btn" href="' + D.files.paletteHtml + '" target="_blank">Design Tokens</a>';

    document.querySelectorAll('.tab').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
      };
    });

    // Overview
    let ov = '<div class="summary-bar">' +
      '<div class="metric"><span>PAGES</span><strong>' + pages.length + '</strong></div>' +
      '<div class="metric"><span>WORDS</span><strong>' + words.toLocaleString() + '</strong></div>' +
      '<div class="metric"><span>SUBDOMAINS</span><strong>' + (subs.length || Object.keys(agg.hosts || {}).length || 1) + '</strong></div>' +
      '<div class="metric"><span>TARGET APIS</span><strong>' + intEps.length + '</strong></div>' +
      '<div class="metric"><span>CONTACTS</span><strong>' + cCount + '</strong></div>' +
      '<div class="metric"><span>FORMS / TABLES</span><strong>' + (agg.forms?.length || 0) + ' / ' + (agg.tables?.length || 0) + '</strong></div>' +
    '</div><div class="grid-2"><div>';

    if (subs.length) {
      ov += '<div class="box"><div class="box-head"><span>Subdomains</span><span>' + subs.length + '</span></div>' +
        '<table><thead><tr><th>Host</th><th>Status</th><th>IP</th><th>Title</th></tr></thead><tbody>' +
        subs.slice(0, 10).map(s => '<tr><td><a href="' + esc(s.url || 'https://' + s.host) + '" target="_blank">' + esc(s.host) + '</a></td><td>' + (s.status || '-') + '</td><td style="color:var(--muted)">' + esc((s.ips || [])[0] || '') + '</td><td>' + esc(s.title || '') + '</td></tr>').join('') +
        '</tbody></table></div>';
    }

    if (agg.tech?.length) {
      ov += '<div class="box"><div class="box-head"><span>Tech Stack</span></div><div class="box-body">' +
        agg.tech.map(t => '<span class="tag">' + esc(t.name) + '</span>').join('') +
      '</div></div>';
    }

    if (D.designTokens?.colors?.length) {
      ov += '<div class="box"><div class="box-head"><span>Palette</span></div><div class="box-body"><div class="swatches">' +
        D.designTokens.colors.slice(0, 10).map(c => '<div class="swatch"><span class="dot" style="background:' + esc(c.color) + '"></span>' + esc(c.color) + '</div>').join('') +
      '</div></div></div>';
    }

    ov += '</div><div>';

    if (D.files.origScreen || D.files.cloneScreen) {
      ov += '<div class="box"><div class="box-head"><span>Screenshots</span></div><div class="box-body"><div class="shots">' +
        (D.files.origScreen ? '<div><div style="color:var(--muted);margin-bottom:4px;font-size:11px">Original</div><a href="' + D.files.origScreen + '" target="_blank"><img src="' + D.files.origScreen + '" /></a></div>' : '') +
        (D.files.cloneScreen ? '<div><div style="color:var(--muted);margin-bottom:4px;font-size:11px">Local Clone</div><a href="' + D.files.cloneScreen + '" target="_blank"><img src="' + D.files.cloneScreen + '" /></a></div>' : '') +
      '</div></div></div>';
    }

    if (intEps.length) {
      ov += '<div class="box"><div class="box-head"><span>Target API Routes</span><span>' + intEps.length + '</span></div>' +
        '<table><tbody>' + intEps.slice(0, 12).map(u => '<tr><td><a href="' + esc(u) + '" target="_blank">' + esc(u) + '</a></td></tr>').join('') + '</tbody></table></div>';
    }

    ov += '</div></div>';
    document.getElementById('panel-overview').innerHTML = ov;

    // Subdomains
    document.getElementById('panel-subdomains').innerHTML =
      '<div class="box"><div class="box-head"><span>Subdomains & Hosts</span><span>' + subs.length + '</span></div>' +
      '<table><thead><tr><th>Host</th><th>Status</th><th>IPs</th><th>Server</th><th>Title</th><th>Source</th></tr></thead><tbody>' +
      (subs.length ? subs.map(s => '<tr><td><a href="' + esc(s.url || 'https://' + s.host) + '" target="_blank">' + esc(s.host) + '</a></td><td>' + (s.status || 'DEAD') + '</td><td style="color:var(--muted)">' + esc((s.ips || []).join(', ')) + '</td><td>' + esc(s.server || '') + '</td><td>' + esc(s.title || '') + '</td><td style="color:var(--muted)">' + esc((s.sources || []).join(', ')) + '</td></tr>').join('') : '<tr><td colspan="6">No subdomain scan data.</td></tr>') +
      '</tbody></table></div>';

    // Pages
    window.toggleRead = (i) => {
      const el = document.getElementById('read-' + i);
      if (el) el.style.display = el.style.display === 'none' ? 'table-row' : 'none';
    };

    const renderPages = (q = '') => {
      const f = q.toLowerCase();
      const list = pages.map((p, i) => ({ p, i })).filter(({ p }) => !f || p.url.toLowerCase().includes(f) || (p.title || '').toLowerCase().includes(f));
      return '<table><thead><tr><th>Status</th><th>URL</th><th>Title</th><th>Words</th><th></th></tr></thead><tbody>' +
        list.map(({ p, i }) =>
          '<tr><td>' + (p.status || 200) + '</td><td><a href="' + esc(p.url) + '" target="_blank">' + esc(p.url) + '</a></td><td>' + esc(p.title || '') + '</td><td>' + (p.wordCount || 0) + '</td><td><button class="btn" onclick="toggleRead(' + i + ')">Text</button></td></tr>' +
          '<tr id="read-' + i + '" style="display:none"><td colspan="5"><pre class="reader">' + esc(p.markdown || 'Empty') + '</pre></td></tr>'
        ).join('') + '</tbody></table>';
    };

    document.getElementById('panel-pages').innerHTML =
      '<div class="box"><div class="box-head"><span>Crawled Pages (' + pages.length + ')</span><input class="filter" id="pfilter" placeholder="Filter URLs or titles..." /></div>' +
      '<div id="ptable">' + renderPages() + '</div></div>';
    document.getElementById('pfilter')?.addEventListener('input', e => {
      document.getElementById('ptable').innerHTML = renderPages(e.target.value);
    });

    // APIs
    document.getElementById('panel-apis').innerHTML =
      '<div class="grid-2">' +
      '<div class="box"><div class="box-head"><span>Target API & Data Routes</span><span>' + intEps.length + '</span></div><table><tbody>' +
      (intEps.length ? intEps.map(u => '<tr><td><a href="' + esc(u) + '" target="_blank">' + esc(u) + '</a></td></tr>').join('') : '<tr><td>None</td></tr>') +
      '</tbody></table></div>' +
      '<div class="box"><div class="box-head"><span>Third-Party Endpoints</span><span>' + extEps.length + '</span></div><table><tbody>' +
      (extEps.length ? extEps.map(u => '<tr><td><a href="' + esc(u) + '" target="_blank">' + esc(u) + '</a></td></tr>').join('') : '<tr><td>None</td></tr>') +
      '</tbody></table></div></div>';

    // Contacts
    document.getElementById('panel-contacts').innerHTML =
      '<div class="grid-2">' +
      '<div class="box"><div class="box-head"><span>Emails & Phones</span></div><table><thead><tr><th>Type</th><th>Value</th><th>Hits</th></tr></thead><tbody>' +
      [...(agg.emails || []).map(e => ({ t: 'email', ...e })), ...(agg.phones || []).map(p => ({ t: 'phone', ...p }))].map(x => '<tr><td style="color:var(--gold)">' + x.t + '</td><td>' + esc(x.value) + '</td><td>' + x.count + '</td></tr>').join('') +
      '</tbody></table></div>' +
      '<div class="box"><div class="box-head"><span>Social Profiles</span></div><table><thead><tr><th>Platform</th><th>URL</th></tr></thead><tbody>' +
      (agg.socials || []).map(s => '<tr><td style="color:var(--gold)">' + esc(s.platform) + '</td><td><a href="' + esc(s.url) + '" target="_blank">' + esc(s.url) + '</a></td></tr>').join('') +
      '</tbody></table></div></div>' +
      '<div class="box"><div class="box-head"><span>Forms (' + (agg.forms?.length || 0) + ')</span></div><table><thead><tr><th>Method</th><th>Action</th><th>Page</th><th>Fields</th></tr></thead><tbody>' +
      (agg.forms || []).map(f => '<tr><td style="color:var(--gold)">' + esc(f.method) + '</td><td>' + esc(f.action) + '</td><td>' + esc(f.page) + '</td><td style="color:var(--muted)">' + esc((f.fields || []).map(x => x.name || x.type).join(', ')) + '</td></tr>').join('') +
      '</tbody></table></div>';

    // Links
    document.getElementById('panel-links').innerHTML =
      '<div class="grid-2">' +
      '<div class="box"><div class="box-head"><span>Documents (' + (agg.documents?.length || 0) + ')</span></div><table><tbody>' +
      ((agg.documents || []).length ? agg.documents.map(d => '<tr><td><a href="' + esc(d.url) + '" target="_blank">' + esc(d.url) + '</a></td></tr>').join('') : '<tr><td>None</td></tr>') +
      '</tbody></table></div>' +
      '<div class="box"><div class="box-head"><span>External Domains (' + (agg.externalDomains?.length || 0) + ')</span></div><table><thead><tr><th>Domain</th><th>Links</th></tr></thead><tbody>' +
      (agg.externalDomains || []).map(d => '<tr><td>' + esc(d.domain) + '</td><td>' + d.count + '</td></tr>').join('') +
      '</tbody></table></div></div>';
  </script>
</body>
</html>`;

  const dashboardPath = path.join(baseOutDir, 'DASHBOARD.html');
  await fs.writeFile(dashboardPath, dashboardHtml, 'utf-8');
  return dashboardPath;
}
