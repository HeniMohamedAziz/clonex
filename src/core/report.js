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

async function write(dir, name, content) {
  const full = path.join(dir, name);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf-8');
  return full;
}

export async function writeCrawlReport(result, outDir, extras = {}) {
  await fs.mkdir(outDir, { recursive: true });
  const { meta, pages, aggregate: a } = result;
  const okPages = pages.filter((p) => p.status >= 200 && p.status < 400 && !p.nonHtml);

  await write(outDir, 'crawl.json', JSON.stringify({ meta, aggregate: { ...a, tables: undefined } }, null, 2));
  await write(outDir, 'pages-full.jsonl', pages.map((p) => JSON.stringify(p)).join('\n'));
  await write(
    outDir,
    'pages.json',
    JSON.stringify(
      pages.map((p) => ({
        url: p.url,
        status: p.status,
        title: p.title || null,
        description: p.description || null,
        h1: p.headings?.h1 || [],
        words: p.wordCount || 0,
        depth: p.depth,
        links: p.links?.length || 0,
        images: p.images?.length || 0,
        emails: p.emails || [],
        redirectedTo: p.redirectedTo || null
      })),
      null,
      2
    )
  );

  await write(
    outDir,
    'pages.csv',
    toCsv(
      ['url', 'status', 'depth', 'title', 'description', 'h1', 'words', 'links', 'images', 'forms', 'ms', 'bytes', 'found_on'],
      pages.map((p) => [
        p.url, p.status, p.depth, p.title, p.description, p.headings?.h1?.[0], p.wordCount,
        p.links?.length, p.images?.length, p.forms?.length, p.elapsedMs, p.bytes, p.foundOn
      ])
    )
  );

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
    await write(path.join(outDir, 'content', p.host), `${slugForUrl(p.url)}.md`, front + p.markdown);
  }

  await write(
    outDir,
    'contacts.csv',
    toCsv(
      ['type', 'value', 'occurrences', 'pages'],
      [
        ...a.emails.map((e) => ['email', e.value, e.count, e.pages]),
        ...a.phones.map((p) => ['phone', p.value, p.count, p.pages]),
        ...a.socials.map((s) => [`social:${s.platform}`, s.url, s.pages?.length || 1, s.pages])
      ]
    )
  );
  await write(outDir, 'emails.txt', a.emails.map((e) => e.value).join('\n'));
  await write(outDir, 'phones.txt', a.phones.map((p) => p.value).join('\n'));
  await write(outDir, 'socials.json', JSON.stringify(a.socials, null, 2));

  await write(outDir, 'links/internal.txt', pages.map((p) => p.url).join('\n'));
  await write(outDir, 'links/external.txt', a.externalLinks.map((e) => e.url).join('\n'));
  await write(outDir, 'links/external-domains.txt', a.externalDomains.map((d) => `${d.count}\t${d.domain}`).join('\n'));
  await write(outDir, 'links/media.txt', a.media.map((m) => m.url).join('\n'));
  await write(outDir, 'links/documents.txt', a.documents.map((d) => d.url).join('\n'));
  await write(outDir, 'links/feeds.txt', a.feeds.map((d) => d.url).join('\n'));
  await write(outDir, 'links/endpoints.txt', a.endpoints.join('\n'));
  await write(
    outDir,
    'links/broken.csv',
    toCsv(['url', 'status', 'error', 'found_on'], a.broken.map((b) => [b.url, b.status, b.error, b.foundOn]))
  );
  await write(outDir, 'links/redirects.csv', toCsv(['from', 'to', 'status'], a.redirects.map((r) => [r.from, r.to, r.status])));
  if (a.blockedByRobots.length) await write(outDir, 'links/robots-blocked.txt', a.blockedByRobots.join('\n'));

  await write(outDir, 'forms.json', JSON.stringify(a.forms, null, 2));
  await write(outDir, 'tech.json', JSON.stringify(a.tech, null, 2));

  for (const t of a.tables.slice(0, 300)) {
    await write(path.join(outDir, 'tables'), `${slugForUrl(t.page)}_${t.index + 1}.csv`, t.rows.map((r) => r.map(csvEscape).join(',')).join('\n'));
  }

  const edges = pages.filter((p) => p.foundOn && p.foundOn !== 'sitemap').map((p) => ({ from: p.foundOn, to: p.url }));
  await write(outDir, 'graph.json', JSON.stringify({ nodes: pages.map((p) => ({ id: p.url, status: p.status, depth: p.depth, title: p.title })), edges }, null, 2));

  const sitemapXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...okPages.map((p) => `  <url><loc>${p.url.replace(/&/g, '&amp;')}</loc>${p.lastModified ? `<lastmod>${new Date(p.lastModified).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`),
    '</urlset>'
  ].join('\n');
  await write(outDir, 'sitemap.generated.xml', sitemapXml);

  if (extras.subdomains) {
    await write(outDir, 'subdomains.json', JSON.stringify(extras.subdomains, null, 2));
    await write(
      outDir,
      'subdomains.csv',
      toCsv(
        ['host', 'alive', 'status', 'title', 'ips', 'server', 'redirect', 'sources'],
        extras.subdomains.map((s) => [s.host, s.alive, s.status, s.title, s.ips, s.server, s.redirect, s.sources])
      )
    );
  }
  if (extras.archivedUrls?.length) {
    await write(outDir, 'links/archived.txt', extras.archivedUrls.map((r) => r.url).join('\n'));
  }

  await write(outDir, 'REPORT.md', buildMarkdownReport(result, extras));
  return outDir;
}

function buildMarkdownReport(result, extras) {
  const { meta, pages, aggregate: a } = result;
  const ok = pages.filter((p) => p.status >= 200 && p.status < 400).length;
  const words = pages.reduce((s, p) => s + (p.wordCount || 0), 0);
  const lines = [
    `# CloneX Intelligence Report — ${meta.startHost}`,
    '',
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Target | ${meta.start} |`,
    `| Root domain | ${meta.rootDomain} |`,
    `| Started | ${meta.startedAt} |`,
    `| Duration | ${(meta.durationMs / 1000).toFixed(1)}s${meta.aborted ? ' (aborted)' : ''} |`,
    `| Pages crawled | ${pages.length} (${ok} OK, ${a.broken.length} broken) |`,
    `| Hosts | ${Object.keys(a.hosts).length} |`,
    `| Words indexed | ${words.toLocaleString()} |`,
    `| Emails / Phones | ${a.emails.length} / ${a.phones.length} |`,
    `| Social profiles | ${a.socials.length} |`,
    `| Forms | ${a.forms.length} |`,
    `| Endpoints | ${a.endpoints.length} |`,
    `| Documents / Media | ${a.documents.length} / ${a.media.length} |`,
    `| External links | ${a.externalLinks.length} across ${a.externalDomains.length} domains |`,
    `| Sitemap URLs | ${meta.sitemaps?.urls || 0} |`,
    ''
  ];

  if (extras.subdomains?.length) {
    lines.push(`## Subdomains (${extras.subdomains.length})`, '', '| Host | Status | Title |', '| --- | --- | --- |');
    extras.subdomains.forEach((s) => lines.push(`| ${s.host} | ${s.alive ? s.status : 'dead'} | ${(s.title || '').replace(/\|/g, '/')} |`));
    lines.push('');
  }

  lines.push('## Hosts', '', ...Object.entries(a.hosts).map(([h, c]) => `- ${h} — ${c} pages`), '');
  lines.push('## Technology', '', ...a.tech.map((t) => `- ${t.name} (${t.pages} pages)`), '');
  if (a.emails.length) lines.push('## Emails', '', ...a.emails.map((e) => `- ${e.value} (${e.count})`), '');
  if (a.phones.length) lines.push('## Phones', '', ...a.phones.map((p) => `- ${p.value} (${p.count})`), '');
  if (a.socials.length) lines.push('## Social Profiles', '', ...a.socials.map((s) => `- **${s.platform}** — ${s.url}`), '');
  if (a.forms.length) {
    lines.push('## Forms', '');
    a.forms.slice(0, 50).forEach((f) => lines.push(`- \`${f.method} ${f.action}\` on ${f.page} — fields: ${f.fields.map((x) => x.name || x.type).join(', ')}`));
    lines.push('');
  }
  if (a.endpoints.length) lines.push('## Endpoints', '', ...a.endpoints.slice(0, 200).map((e) => `- \`${e}\``), '');
  if (a.documents.length) lines.push('## Documents', '', ...a.documents.slice(0, 200).map((d) => `- ${d.url}`), '');
  lines.push('## Pages', '', '| Status | URL | Title | Words |', '| --- | --- | --- | --- |');
  pages.slice(0, 1000).forEach((p) => lines.push(`| ${p.status} | ${p.url} | ${(p.title || '').replace(/\|/g, '/').slice(0, 80)} | ${p.wordCount || 0} |`));
  if (a.broken.length) {
    lines.push('', '## Broken Links', '', ...a.broken.map((b) => `- [${b.status || 'ERR'}] ${b.url} ← ${b.foundOn || '-'}`));
  }
  lines.push('', '## Top External Domains', '', ...a.externalDomains.slice(0, 50).map((d) => `- ${d.domain} (${d.count})`));
  return lines.join('\n');
}
