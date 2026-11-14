import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import { launchBrowser } from '../browser-finder.js';
import { captureWebpage } from '../capturer.js';
import { generateHtmlOutput } from '../generators/html-generator.js';
import { generateReactProject } from '../generators/react-generator.js';
import { crawlSite } from './crawler.js';
import { normalizeUrl } from './extractor.js';
import { httpGet, runPool } from './net.js';

export function urlToLocalRelPath(targetUrl, rootOrigin, includeHostDir = false) {
  const u = new URL(targetUrl);
  let pathname = decodeURIComponent(u.pathname || '/');
  pathname = pathname.replace(/\\/g, '/').replace(/\.\.+/g, '');

  if (pathname.endsWith('/')) {
    pathname = `${pathname}index.html`;
  } else if (!path.posix.extname(pathname)) {
    pathname = `${pathname}/index.html`;
  } else if (!/\.html?$/i.test(pathname)) {
    pathname = `${pathname}.html`;
  }

  pathname = pathname.replace(/^\/+/, '');
  if (u.search) {
    const cleanSearch = u.search
      .slice(1)
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 32);
    pathname = pathname.replace(/(\.html?)$/i, `_${cleanSearch}$1`);
  }

  if (includeHostDir || u.origin !== rootOrigin) {
    const cleanHost = u.hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
    return path.posix.join(cleanHost, pathname);
  }
  return pathname;
}

export async function mirrorFullWebsite(startUrl, options = {}) {
  const {
    outputDir,
    maxPages = 25,
    maxDepth = 3,
    includeSubdomains = false,
    extraHosts = [],
    viewportWidth = 1440,
    viewportHeight = 900,
    waitExtraMs = 1000,
    fullScroll = true,
    generateReactForRoot = true,
    downloadDocuments = true,
    token = { aborted: false },
    onProgress = () => {}
  } = options;

  await fs.mkdir(outputDir, { recursive: true });
  const normalizedStart = normalizeUrl(startUrl) || startUrl;
  const rootOrigin = new URL(normalizedStart).origin;

  onProgress('DISCOVERING SITE PAGES & ROUTES...');
  const crawlResult = await crawlSite(normalizedStart, {
    maxPages,
    maxDepth,
    concurrency: 6,
    delayMs: 50,
    includeSubdomains,
    extraHosts,
    respectRobots: false,
    renderMode: 'http',
    useSitemaps: true,
    scanJs: false,
    token,
    onProgress
  });

  const htmlPages = crawlResult.pages
    .filter((p) => p.status >= 200 && p.status < 400 && !p.nonHtml)
    .slice(0, maxPages);

  if (htmlPages.length === 0) {
    htmlPages.push({ url: normalizedStart, title: normalizedStart, depth: 0 });
  }

  const multiHost =
    includeSubdomains ||
    extraHosts.length > 0 ||
    new Set(htmlPages.map((p) => new URL(p.url).origin)).size > 1;

  const urlToRelFile = new Map();
  for (const p of htmlPages) {
    const norm = normalizeUrl(p.url) || p.url;
    const rel = urlToLocalRelPath(norm, rootOrigin, multiHost);
    urlToRelFile.set(norm, rel);
  }

  const allHosts = Array.from(new Set(htmlPages.map((p) => new URL(p.url).origin)));
  onProgress(`IGNITING CHROMIUM FOR ${htmlPages.length} PAGES...`);
  const browser = await launchBrowser(
    [
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--font-render-hinting=none'
    ],
    allHosts
  );

  const clonedPages = [];

  try {
    for (let i = 0; i < htmlPages.length; i++) {
      if (token.aborted) break;
      const pageInfo = htmlPages[i];
      const pageUrl = normalizeUrl(pageInfo.url) || pageInfo.url;
      const relHtmlPath = urlToRelFile.get(pageUrl);
      const pageDir = path.join(outputDir, path.dirname(relHtmlPath));
      const pageBaseName = path.basename(relHtmlPath);

      onProgress(`CLONING [${i + 1}/${htmlPages.length}] ${pageUrl}`);

      try {
        const isRootPage = i === 0;
        const captureData = await captureWebpage(pageUrl, {
          viewportWidth,
          viewportHeight,
          waitExtraMs,
          fullScroll,
          screenshotPath: isRootPage ? path.join(outputDir, 'screenshot-original.png') : null,
          browser,
          onProgress: (msg) =>
            onProgress(`[${i + 1}/${htmlPages.length}] ${msg.toUpperCase()}`)
        });

        const tempPageDir =
          pageBaseName === 'index.html'
            ? pageDir
            : path.join(pageDir, `_page_${path.basename(pageBaseName, '.html')}`);

        const htmlRes = await generateHtmlOutput(captureData, tempPageDir, {
          downloadAssets: true,
          flatDir: true,
          onProgress: () => {}
        });

        if (isRootPage && generateReactForRoot) {
          await generateReactProject(
            htmlRes,
            captureData.designTokens,
            outputDir,
            { onProgress: () => {} }
          ).catch(() => {});
        }

        clonedPages.push({
          url: pageUrl,
          title: captureData.title || pageInfo.title || pageUrl,
          relHtmlPath:
            pageBaseName === 'index.html'
              ? relHtmlPath
              : path.posix.join(
                  path.posix.dirname(relHtmlPath),
                  `_page_${path.basename(pageBaseName, '.html')}`,
                  'index.html'
                ),
          absHtmlPath: htmlRes.htmlPath,
          pageDir: tempPageDir,
          assetsCount: htmlRes.assetStats.downloadedCount
        });
      } catch (err) {
        clonedPages.push({
          url: pageUrl,
          title: pageInfo.title || pageUrl,
          error: err.message
        });
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  onProgress('REWRITING CROSS-PAGE LINKS FOR OFFLINE NAVIGATION...');
  const finalUrlMap = new Map();
  for (const cp of clonedPages) {
    if (cp.relHtmlPath) {
      finalUrlMap.set(cp.url, cp.relHtmlPath);
    }
  }

  for (const cp of clonedPages) {
    if (!cp.absHtmlPath) continue;
    try {
      const rawHtml = await fs.readFile(cp.absHtmlPath, 'utf-8');
      const $ = cheerio.load(rawHtml, { decodeEntities: false });
      const fromDir = path.posix.dirname(cp.relHtmlPath);

      $('a[href]').each((_, el) => {
        const $a = $(el);
        const href = $a.attr('href');
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:'))
          return;
        const norm = normalizeUrl(href, cp.url);
        if (norm && finalUrlMap.has(norm)) {
          const targetRel = finalUrlMap.get(norm);
          let relLink = path.posix.relative(fromDir, targetRel);
          if (!relLink.startsWith('.')) relLink = `./${relLink}`;
          $a.attr('href', relLink);
        }
      });

      await fs.writeFile(cp.absHtmlPath, $.html(), 'utf-8');
    } catch {}
  }

  let downloadedDocs = 0;
  if (downloadDocuments && crawlResult.aggregate.documents.length > 0 && !token.aborted) {
    const docsDir = path.join(outputDir, 'documents');
    await fs.mkdir(docsDir, { recursive: true });
    const docsToFetch = crawlResult.aggregate.documents.slice(0, 100);
    onProgress(`DOWNLOADING ${docsToFetch.length} DISCOVERED DOCUMENTS...`);
    await runPool(
      docsToFetch,
      6,
      async (doc, idx) => {
        const res = await httpGet(doc.url, { asBuffer: true, timeoutMs: 20000 });
        if (res.ok && res.body) {
          const base =
            path.basename(new URL(doc.url).pathname).replace(/[^a-zA-Z0-9._-]/g, '_') ||
            `doc_${idx + 1}.bin`;
          await fs.writeFile(path.join(docsDir, base), res.body);
          downloadedDocs++;
        }
      },
      () => token.aborted
    );
  }

  const indexDashboardHtml = buildMirrorDashboardHtml(normalizedStart, clonedPages, crawlResult);
  const dashboardPath = path.join(outputDir, 'SITE-INDEX.html');
  await fs.writeFile(dashboardPath, indexDashboardHtml, 'utf-8');

  return {
    outputDir,
    dashboardPath,
    clonedPages,
    downloadedDocs,
    crawlResult
  };
}

function buildMirrorDashboardHtml(rootUrl, clonedPages, crawlResult) {
  const rows = clonedPages
    .map((p, idx) => {
      if (p.error) {
        return `<tr><td>${idx + 1}</td><td>${p.title}</td><td><a href="${p.url}" target="_blank">${p.url}</a></td><td style="color:#ef4444">ERROR: ${p.error}</td></tr>`;
      }
      return `<tr>
        <td>${idx + 1}</td>
        <td><strong>${p.title}</strong></td>
        <td><a href="${p.relHtmlPath}" style="color:#00e5ff">${p.relHtmlPath}</a></td>
        <td><a href="${p.url}" target="_blank" style="color:#fbbf24">${p.url}</a> (${p.assetsCount || 0} assets)</td>
      </tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>CloneX Site Mirror // ${rootUrl}</title>
  <style>
    body { background: #09090b; color: #f4f4f5; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin: 0; padding: 32px; }
    h1 { color: #fbbf24; border-bottom: 2px solid #dc2626; padding-bottom: 12px; }
    .meta { color: #00e5ff; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; background: #18181b; border: 1px solid #27272a; }
    th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid #27272a; font-size: 14px; }
    th { background: #7f1d1d; color: #fbbf24; text-transform: uppercase; }
    tr:hover { background: #27272a; }
    a { text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>◈ CLONEX // FULL SITE MIRROR INDEX</h1>
  <div class="meta">
    TARGET: ${rootUrl} &nbsp;|&nbsp; CLONED PAGES: ${clonedPages.filter((p) => !p.error).length}/${clonedPages.length} &nbsp;|&nbsp; TOTAL DISCOVERED LINKS: ${crawlResult.pages.length}
  </div>
  <table>
    <thead>
      <tr><th>#</th><th>Page Title</th><th>Local Offline Clone</th><th>Original Source URL</th></tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;
}
