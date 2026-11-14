import fs from 'fs/promises';
import path from 'path';

export function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join(' | ') : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers, rows) {
  return [headers.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
}

export function slugForUrl(url) {
  const u = new URL(url);
  const p = (u.pathname.replace(/^\/+|\/+$/g, '') || 'index').replace(/[^a-zA-Z0-9._-]+/g, '_');
  const q = u.search ? '_' + u.search.slice(1).replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40) : '';
  return (p + q).slice(0, 150);
}

async function write(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf-8');
  return full;
}

function splitEndpointsByScope(endpoints, rootDomain) {
  const internal = [];
  const external = [];
  for (const ep of endpoints || []) {
    try {
      const h = new URL(ep).hostname.toLowerCase();
      if (h === rootDomain || h.endsWith(`.${rootDomain}`)) {
        internal.push(ep);
      } else {
        external.push(ep);
      }
    } catch {
      internal.push(ep);
    }
  }
  return { internal, external };
}

export async function writeCrawlReport(result, intelDir, extras = {}) {
  await fs.mkdir(intelDir, { recursive: true });
  const { meta, pages, aggregate: a } = result;
  const okPages = pages.filter((p) => p.status >= 200 && p.status < 400 && !p.nonHtml);
  const { internal: internalEndpoints, external: externalEndpoints } = splitEndpointsByScope(
    a.endpoints,
    meta.rootDomain
  );

  // 01-subdomains
  if (extras.subdomains) {
    await write(intelDir, '01-subdomains/subdomains.json', JSON.stringify(extras.subdomains, null, 2));
    await write(
      intelDir,
      '01-subdomains/subdomains.csv',
      toCsv(
        ['host', 'alive', 'status', 'url', 'title', 'ips', 'server', 'redirect', 'sources'],
        extras.subdomains.map((s) => [
          s.host,
          s.alive,
          s.status,
          s.url,
          s.title,
          s.ips,
          s.server,
          s.redirect,
          s.sources
        ])
      )
    );
  }
  if (extras.archivedUrls?.length) {
    await write(
      intelDir,
      '01-subdomains/wayback-archive-urls.txt',
      extras.archivedUrls.map((r) => r.url).join('\n')
    );
  }

  // 02-pages-and-content
  await write(
    intelDir,
    '02-pages-and-content/pages-summary.csv',
    toCsv(
      ['url', 'status', 'depth', 'title', 'description', 'h1', 'words', 'links', 'images', 'forms', 'ms', 'bytes', 'found_on'],
      pages.map((p) => [
        p.url,
        p.status,
        p.depth,
        p.title,
        p.description,
        p.headings?.h1?.[0],
        p.wordCount,
        p.links?.length,
        p.images?.length,
        p.forms?.length,
        p.elapsedMs,
        p.bytes,
        p.foundOn
      ])
    )
  );

  const sitemapXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...okPages.map(
      (p) =>
        `  <url><loc>${p.url.replace(/&/g, '&amp;')}</loc>${
          p.lastModified ? `<lastmod>${new Date(p.lastModified).toISOString().slice(0, 10)}</lastmod>` : ''
        }</url>`
    ),
    '</urlset>'
  ].join('\n');
  await write(intelDir, '02-pages-and-content/sitemap.xml', sitemapXml);

  for (const p of okPages) {
    if (!p.markdown) continue;
    const front = [
      '---',
      `url: ${p.url}`,
      `title: ${JSON.stringify(p.title || '')}`,
      `description: ${JSON.stringify(p.description || '')}`,
      `words: ${p.wordCount || 0}`,
      '---',
      ''
    ].join('\n');
    await write(
      path.join(intelDir, '02-pages-and-content', 'markdown-by-host', p.host),
      `${slugForUrl(p.url)}.md`,
      front + p.markdown
    );
  }

  // 03-apis-and-links
  await write(intelDir, '03-apis-and-links/internal-api-endpoints.txt', internalEndpoints.join('\n'));
  await write(intelDir, '03-apis-and-links/third-party-endpoints.txt', externalEndpoints.join('\n'));
  await write(intelDir, '03-apis-and-links/internal-pages.txt', pages.map((p) => p.url).join('\n'));
  await write(intelDir, '03-apis-and-links/external-links.txt', a.externalLinks.map((e) => e.url).join('\n'));
  await write(
    intelDir,
    '03-apis-and-links/external-domains.csv',
    toCsv(['domain', 'link_count'], a.externalDomains.map((d) => [d.domain, d.count]))
  );
  await write(intelDir, '03-apis-and-links/documents-and-files.txt', a.documents.map((d) => d.url).join('\n'));
  await write(intelDir, '03-apis-and-links/media-assets.txt', a.media.map((m) => m.url).join('\n'));
  if (a.broken.length) {
    await write(
      intelDir,
      '03-apis-and-links/broken-links.csv',
      toCsv(['url', 'status', 'error', 'found_on'], a.broken.map((b) => [b.url, b.status, b.error, b.foundOn]))
    );
  }
  if (a.redirects.length) {
    await write(
      intelDir,
      '03-apis-and-links/redirects.csv',
      toCsv(['from', 'to', 'status'], a.redirects.map((r) => [r.from, r.to, r.status]))
    );
  }

  // 04-contacts-and-forms
  await write(
    intelDir,
    '04-contacts-and-forms/contacts-and-socials.csv',
    toCsv(
      ['type', 'value', 'occurrences', 'pages'],
      [
        ...a.emails.map((e) => ['email', e.value, e.count, e.pages]),
        ...a.phones.map((p) => ['phone', p.value, p.count, p.pages]),
        ...a.socials.map((s) => [`social:${s.platform}`, s.url, s.pages?.length || 1, s.pages])
      ]
    )
  );
  await write(intelDir, '04-contacts-and-forms/emails.txt', a.emails.map((e) => e.value).join('\n'));
  await write(intelDir, '04-contacts-and-forms/phones.txt', a.phones.map((p) => p.value).join('\n'));
  await write(intelDir, '04-contacts-and-forms/socials.json', JSON.stringify(a.socials, null, 2));
  await write(intelDir, '04-contacts-and-forms/forms.json', JSON.stringify(a.forms, null, 2));

  // 05-tables-and-structured-data
  await write(intelDir, '05-tables-and-structured-data/tech-stack.json', JSON.stringify(a.tech, null, 2));
  for (const t of a.tables.slice(0, 300)) {
    await write(
      path.join(intelDir, '05-tables-and-structured-data', 'tables'),
      `${slugForUrl(t.page)}_table_${t.index + 1}.csv`,
      t.rows.map((r) => r.map(csvEscape).join(',')).join('\n')
    );
  }

  // 06-raw-data
  await write(
    intelDir,
    '06-raw-data/full-crawl.json',
    JSON.stringify({ meta, aggregate: { ...a, tables: undefined } }, null, 2)
  );
  await write(intelDir, '06-raw-data/pages-full.jsonl', pages.map((p) => JSON.stringify(p)).join('\n'));
  const edges = pages
    .filter((p) => p.foundOn && p.foundOn !== 'sitemap')
    .map((p) => ({ from: p.foundOn, to: p.url }));
  await write(
    intelDir,
    '06-raw-data/link-graph.json',
    JSON.stringify(
      {
        nodes: pages.map((p) => ({ id: p.url, status: p.status, depth: p.depth, title: p.title })),
        edges
      },
      null,
      2
    )
  );

  await write(
    intelDir,
    'REPORT.md',
    buildMarkdownReport(result, extras, internalEndpoints, externalEndpoints)
  );
  return intelDir;
}

function buildMarkdownReport(result, extras, internalEndpoints, externalEndpoints) {
  const { meta, pages, aggregate: a } = result;
  const ok = pages.filter((p) => p.status >= 200 && p.status < 400).length;
  const words = pages.reduce((s, p) => s + (p.wordCount || 0), 0);
  const lines = [
    `# CloneX Intelligence Dossier — ${meta.startHost}`,
    '',
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Target | ${meta.start} |`,
    `| Root Domain | ${meta.rootDomain} |`,
    `| Scanned At | ${meta.startedAt} |`,
    `| Duration | ${(meta.durationMs / 1000).toFixed(1)}s |`,
    `| Pages Crawled | ${pages.length} (${ok} OK, ${a.broken.length} broken) |`,
    `| Active Hosts | ${Object.keys(a.hosts).length} |`,
    `| Words Extracted | ${words.toLocaleString()} |`,
    `| Target API Routes | ${internalEndpoints.length} |`,
    `| Third-Party Endpoints | ${externalEndpoints.length} |`,
    `| Emails / Phones | ${a.emails.length} / ${a.phones.length} |`,
    `| Social Profiles | ${a.socials.length} |`,
    `| HTML Forms / Tables | ${a.forms.length} / ${a.tables.length} |`,
    `| Documents / Media | ${a.documents.length} / ${a.media.length} |`,
    `| External Links | ${a.externalLinks.length} across ${a.externalDomains.length} domains |`,
    ''
  ];

  if (extras.subdomains?.length) {
    lines.push(
      `## 1. Subdomains & Live Hosts (${extras.subdomains.length})`,
      '',
      '| Host | Status | IPs | Title | Sources |',
      '| --- | --- | --- | --- | --- |'
    );
    extras.subdomains.forEach((s) =>
      lines.push(
        `| ${s.host} | ${s.alive ? s.status : 'DEAD'} | ${(s.ips || []).join(', ')} | ${(s.title || '').replace(/\|/g, '/')} | ${(s.sources || []).join(', ')} |`
      )
    );
    lines.push('');
  }

  lines.push('## 2. Technology Stack', '', ...a.tech.map((t) => `- **${t.name}** (${t.pages} pages)`), '');

  if (internalEndpoints.length) {
    lines.push(
      `## 3. Target API & Data Routes (${internalEndpoints.length})`,
      '',
      ...internalEndpoints.slice(0, 200).map((e) => `- \`${e}\``),
      ''
    );
  }

  if (a.emails.length || a.phones.length || a.socials.length) {
    lines.push('## 4. Contacts & Social Profiles', '');
    a.emails.forEach((e) => lines.push(`- **Email:** \`${e.value}\` (${e.count} pages)`));
    a.phones.forEach((p) => lines.push(`- **Phone:** \`${p.value}\` (${p.count} pages)`));
    a.socials.forEach((s) => lines.push(`- **${s.platform}:** ${s.url}`));
    lines.push('');
  }

  if (a.forms.length) {
    lines.push('## 5. HTML Forms', '');
    a.forms
      .slice(0, 50)
      .forEach((f) =>
        lines.push(
          `- \`${f.method} ${f.action}\` (on ${f.page}) — Fields: \`${f.fields.map((x) => x.name || x.type).join(', ')}\``
        )
      );
    lines.push('');
  }

  lines.push('## 6. Crawled Pages Index', '', '| Status | URL | Title | Words |', '| --- | --- | --- | --- |');
  pages
    .slice(0, 500)
    .forEach((p) =>
      lines.push(
        `| ${p.status} | ${p.url} | ${(p.title || '').replace(/\|/g, '/').slice(0, 80)} | ${p.wordCount || 0} |`
      )
    );

  if (externalEndpoints.length) {
    lines.push(
      '',
      `## 7. Third-Party Integrations & Endpoints (${externalEndpoints.length})`,
      '',
      ...externalEndpoints.slice(0, 100).map((e) => `- \`${e}\``)
    );
  }

  lines.push('', '## 8. Top Outbound Domains', '', ...a.externalDomains.slice(0, 40).map((d) => `- **${d.domain}** (${d.count})`));
  return lines.join('\n');
}
