import { httpGet, sleep, getRootDomain, runPool, DEFAULT_USER_AGENT } from './net.js';
import { extractPage, normalizeUrl, classifyUrl, extractEndpointsFromJs, detectSocial } from './extractor.js';
import { launchBrowser } from '../browser-finder.js';

const MAX_TEXT = 60000;

function compileRobotsPattern(p) {
  const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const anchored = escaped.endsWith('\\$') ? escaped.slice(0, -2) + '$' : escaped;
  return new RegExp('^' + anchored);
}

export function parseRobots(txt, ua = 'clonex') {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let lastWasAgent = false;

  for (const rawLine of String(txt || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line.includes(':')) continue;
    const idx = line.indexOf(':');
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();

    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], delay: null };
        groups.push(current);
      }
      current.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === 'sitemap') {
      if (val) sitemaps.push(val);
    } else if (current && (key === 'allow' || key === 'disallow')) {
      if (val) current.rules.push({ allow: key === 'allow', path: val, re: compileRobotsPattern(val) });
    } else if (current && key === 'crawl-delay') {
      current.delay = parseFloat(val) || null;
    }
  }

  const group =
    groups.find((g) => g.agents.some((a) => a !== '*' && ua.toLowerCase().includes(a))) ||
    groups.find((g) => g.agents.includes('*')) ||
    { rules: [], delay: null };

  return {
    sitemaps,
    crawlDelay: group.delay,
    disallowed: group.rules.filter((r) => !r.allow).map((r) => r.path),
    allowed(pathWithQuery) {
      let best = null;
      for (const r of group.rules) {
        if (r.re.test(pathWithQuery) && (!best || r.path.length > best.path.length)) best = r;
      }
      return !best || best.allow;
    }
  };
}

export async function loadSitemapUrls(sitemapUrls, { userAgent, maxSitemaps = 25, maxUrls = 10000 } = {}) {
  const queue = [...new Set(sitemapUrls)];
  const visited = new Set();
  const urls = new Set();

  while (queue.length && visited.size < maxSitemaps && urls.size < maxUrls) {
    const sm = queue.shift();
    if (visited.has(sm)) continue;
    visited.add(sm);
    const res = await httpGet(sm, { userAgent, timeoutMs: 20000 });
    if (!res.ok || !res.body) continue;
    const body = res.body;
    const locs = Array.from(body.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)).map((m) =>
      m[1].replace(/&amp;/g, '&').trim()
    );
    const isIndex = /<sitemapindex/i.test(body);
    for (const loc of locs) {
      if (isIndex || /\.xml(\.gz)?(\?|$)/i.test(loc)) {
        if (!/\.gz(\?|$)/i.test(loc)) queue.push(loc);
      } else {
        urls.add(loc);
      }
    }
    if (!locs.length && /^\s*https?:\/\//.test(body)) {
      body.split(/\r?\n/).forEach((l) => /^https?:\/\//.test(l.trim()) && urls.add(l.trim()));
    }
  }
  return { urls: Array.from(urls).slice(0, maxUrls), sitemapsRead: Array.from(visited) };
}

export async function crawlSite(startUrl, options = {}) {
  const {
    maxPages = 300,
    maxDepth = 6,
    concurrency = 8,
    delayMs = 75,
    includeSubdomains = false,
    extraHosts = [],
    respectRobots = true,
    renderMode = 'http',
    userAgent = DEFAULT_USER_AGENT,
    useSitemaps = true,
    seedUrls = [],
    scanJs = true,
    token = { aborted: false },
    onProgress = () => {},
    onPage = () => {}
  } = options;

  const startedAt = new Date();
  const start = normalizeUrl(startUrl);
  const startHost = new URL(start).hostname;
  const rootDomain = getRootDomain(startHost);
  const bareStart = startHost.replace(/^www\./, '');
  const allowedHosts = new Set([startHost, bareStart, `www.${bareStart}`, ...extraHosts.map((h) => h.toLowerCase())]);

  const inScope = (url) => {
    try {
      const h = new URL(url).hostname;
      if (allowedHosts.has(h)) return true;
      return includeSubdomains && (h === rootDomain || h.endsWith(`.${rootDomain}`));
    } catch {
      return false;
    }
  };

  const queue = [];
  const seen = new Set();
  const pages = [];
  const resources = new Map();
  const external = new Map();
  const scriptUrls = new Set();
  const blockedByRobots = [];
  const robotsCache = new Map();
  const sitemapInfo = { read: [], urls: 0 };
  let processed = 0;
  let active = 0;

  const addResource = (url, type, from) => {
    if (!resources.has(url)) resources.set(url, { url, type, foundOn: from });
  };

  const enqueue = (rawUrl, depth, from, source = 'link') => {
    const url = normalizeUrl(rawUrl);
    if (!url || seen.has(url)) return;
    if (!inScope(url)) return;
    const type = classifyUrl(url);
    if (type !== 'page') {
      seen.add(url);
      addResource(url, type, from);
      return;
    }
    if (depth > maxDepth) return;
    seen.add(url);
    queue.push({ url, depth, from, source });
  };

  const getRobots = (origin) => {
    if (!robotsCache.has(origin)) {
      robotsCache.set(
        origin,
        httpGet(`${origin}/robots.txt`, { userAgent, timeoutMs: 10000 }).then((res) =>
          parseRobots(res.ok && res.body && !/<html/i.test(res.body.slice(0, 200)) ? res.body : '', 'clonex')
        )
      );
    }
    return robotsCache.get(origin);
  };

  enqueue(start, 0, null, 'start');
  for (const s of seedUrls) enqueue(s, 1, null, 'seed');

  if (useSitemaps) {
    onProgress('READING ROBOTS.TXT & SITEMAPS');
    const origins = new Set([new URL(start).origin]);
    for (const h of extraHosts) origins.add(`https://${h}`);
    const smList = [];
    for (const origin of origins) {
      const robots = await getRobots(origin);
      smList.push(...(robots.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`]));
    }
    const sm = await loadSitemapUrls(smList, { userAgent });
    sitemapInfo.read = sm.sitemapsRead;
    sitemapInfo.urls = sm.urls.length;
    for (const u of sm.urls) enqueue(u, 1, 'sitemap', 'sitemap');
  }

  let browser = null;
  let context = null;
  if (renderMode === 'browser') {
    onProgress('IGNITING HEADLESS CHROMIUM');
    browser = await launchBrowser(['--disable-web-security'], [start, ...extraHosts]);
    context = await browser.newContext({
      userAgent,
      ignoreHTTPSErrors: true,
      viewport: { width: 1366, height: 900 }
    });
    await context.route('**/*', (route) => {
      const t = route.request().resourceType();
      if (t === 'image' || t === 'media' || t === 'font') return route.abort();
      return route.continue();
    });
  }

  const fetchHttp = async (item) => {
    const res = await httpGet(item.url, { userAgent, timeoutMs: 20000 });
    return {
      status: res.status,
      finalUrl: normalizeUrl(res.url) || item.url,
      headers: res.headers,
      contentType: res.contentType,
      body: res.body,
      elapsedMs: res.elapsedMs,
      error: res.error,
      xhr: []
    };
  };

  const fetchBrowser = async (item, bpage) => {
    const xhr = new Set();
    const onReq = (req) => {
      const t = req.resourceType();
      if (t === 'xhr' || t === 'fetch') xhr.add(req.url());
    };
    bpage.on('request', onReq);
    const started = Date.now();
    try {
      const resp = await bpage.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await bpage.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
      const finalUrl = bpage.url();
      if (finalUrl.startsWith('chrome-error://')) throw new Error('unreachable');
      const headers = resp ? resp.headers() : {};
      return {
        status: resp ? resp.status() : 200,
        finalUrl: normalizeUrl(finalUrl) || item.url,
        headers,
        contentType: (headers['content-type'] || 'text/html').toLowerCase(),
        body: await bpage.content(),
        elapsedMs: Date.now() - started,
        xhr: Array.from(xhr)
      };
    } catch (err) {
      return { status: 0, finalUrl: item.url, headers: {}, contentType: '', body: null, error: err.message, elapsedMs: Date.now() - started, xhr: [] };
    } finally {
      bpage.off('request', onReq);
    }
  };

  const lane = async () => {
    const bpage = context ? await context.newPage() : null;
    try {
      while (!token.aborted) {
        if (processed >= maxPages) break;
        const item = queue.shift();
        if (!item) {
          if (active === 0) break;
          await sleep(60);
          continue;
        }

        processed++;
        active++;
        try {
          const u = new URL(item.url);
          if (respectRobots) {
            const robots = await getRobots(u.origin);
            if (!robots.allowed(u.pathname + u.search)) {
              blockedByRobots.push(item.url);
              processed--;
              continue;
            }
          }

          onProgress(`CRAWL [${processed}/${maxPages}] Q:${queue.length} ${u.hostname}${u.pathname}`.slice(0, 90));
          const res = bpage ? await fetchBrowser(item, bpage) : await fetchHttp(item);

          const record = {
            url: item.url,
            finalUrl: res.finalUrl,
            host: u.hostname,
            path: u.pathname,
            depth: item.depth,
            foundOn: item.from,
            source: item.source,
            status: res.status,
            error: res.error || null,
            contentType: res.contentType,
            elapsedMs: res.elapsedMs,
            bytes: res.body ? Buffer.byteLength(res.body) : 0,
            server: res.headers['server'] || null,
            lastModified: res.headers['last-modified'] || null,
            securityHeaders: {
              hsts: Boolean(res.headers['strict-transport-security']),
              csp: Boolean(res.headers['content-security-policy']),
              xFrameOptions: res.headers['x-frame-options'] || null,
              referrerPolicy: res.headers['referrer-policy'] || null
            }
          };

          if (res.finalUrl !== item.url) {
            record.redirectedTo = res.finalUrl;
            if (inScope(res.finalUrl)) seen.add(res.finalUrl);
          }

          const isHtml = res.body && (res.contentType.includes('html') || /^\s*<(!doctype|html)/i.test(res.body.slice(0, 300)));
          if (isHtml && res.status < 400) {
            const data = extractPage(res.body, res.finalUrl, res.headers);
            if (data.text.length > MAX_TEXT) data.text = data.text.slice(0, MAX_TEXT);
            Object.assign(record, data, { url: item.url });
            if (res.xhr.length) record.endpoints = Array.from(new Set([...record.endpoints, ...res.xhr]));

            for (const link of data.links) {
              if (inScope(link.url)) {
                enqueue(link.url, item.depth + 1, item.url);
              } else {
                const ext = external.get(link.url) || { url: link.url, text: link.text, count: 0, foundOn: [] };
                ext.count++;
                if (ext.foundOn.length < 5) ext.foundOn.push(item.url);
                external.set(link.url, ext);
              }
            }
            for (const ifr of data.iframes) if (inScope(ifr)) enqueue(ifr, item.depth + 1, item.url);
            for (const alt of data.alternates) enqueue(alt.url, item.depth + 1, item.url, 'hreflang');
            if (data.canonical) enqueue(data.canonical, item.depth + 1, item.url, 'canonical');
            for (const img of data.images) addResource(img.url, 'media', item.url);
            for (const doc of data.documents) addResource(doc.url, 'document', item.url);
            for (const v of data.videos) addResource(v, 'media', item.url);
            for (const f of data.feeds) addResource(f, 'feed', item.url);
            for (const s of data.scripts) if (inScope(s)) scriptUrls.add(s);
          } else if (res.body && res.status < 400) {
            record.nonHtml = true;
            addResource(item.url, 'document', item.from);
          }

          pages.push(record);
          onPage(record, { processed, queued: queue.length });
        } finally {
          active--;
          if (delayMs) await sleep(delayMs);
        }
      }
    } finally {
      if (bpage) await bpage.close().catch(() => {});
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, lane));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  const jsEndpoints = new Set();
  if (scanJs && scriptUrls.size && !token.aborted) {
    const list = Array.from(scriptUrls).slice(0, 80);
    let done = 0;
    await runPool(
      list,
      6,
      async (src) => {
        const res = await httpGet(src, { userAgent, timeoutMs: 15000, maxBytes: 8 * 1024 * 1024 });
        done++;
        onProgress(`JS ANALYSIS [${done}/${list.length}] ${src.split('/').pop()}`.slice(0, 90));
        if (res.ok && res.body) extractEndpointsFromJs(res.body, src).forEach((e) => jsEndpoints.add(e));
      },
      () => token.aborted
    );
  }

  return buildCrawlResult({
    start,
    startHost,
    rootDomain,
    startedAt,
    pages,
    resources,
    external,
    jsEndpoints,
    blockedByRobots,
    sitemapInfo,
    robotsCache,
    queueRemaining: queue.length,
    aborted: token.aborted,
    settings: { maxPages, maxDepth, concurrency, delayMs, includeSubdomains, respectRobots, renderMode, extraHosts }
  });
}

async function buildCrawlResult(ctx) {
  const { pages, resources, external, jsEndpoints } = ctx;
  const emails = new Map();
  const phones = new Map();
  const socials = new Map();
  const tech = new Map();
  const forms = [];
  const endpoints = new Set(jsEndpoints);
  const hosts = new Map();
  const jsonLdTypes = new Map();
  const languages = new Set();
  const tables = [];
  const broken = [];
  const redirects = [];

  const bump = (map, key, page) => {
    const entry = map.get(key) || { value: key, count: 0, pages: [] };
    entry.count++;
    if (entry.pages.length < 10 && !entry.pages.includes(page)) entry.pages.push(page);
    map.set(key, entry);
  };

  for (const p of pages) {
    hosts.set(p.host, (hosts.get(p.host) || 0) + 1);
    if (p.status >= 400 || p.status === 0) broken.push({ url: p.url, status: p.status, error: p.error, foundOn: p.foundOn });
    if (p.redirectedTo) redirects.push({ from: p.url, to: p.redirectedTo, status: p.status });
    (p.emails || []).forEach((e) => bump(emails, e, p.url));
    (p.phones || []).forEach((ph) => bump(phones, ph, p.url));
    (p.socials || []).forEach((s) => {
      if (!socials.has(s.url)) socials.set(s.url, { platform: s.platform, url: s.url, pages: [p.url] });
    });
    (p.tech || []).forEach((t) => tech.set(t, (tech.get(t) || 0) + 1));
    (p.forms || []).forEach((f) => forms.push({ page: p.url, ...f }));
    (p.endpoints || []).forEach((e) => endpoints.add(e));
    if (p.language) languages.add(p.language);
    (p.jsonLd || []).forEach((j) => {
      const items = Array.isArray(j) ? j : j['@graph'] || [j];
      items.forEach((it) => {
        const t = Array.isArray(it?.['@type']) ? it['@type'].join(',') : it?.['@type'];
        if (t) jsonLdTypes.set(t, (jsonLdTypes.get(t) || 0) + 1);
      });
    });
    (p.tables || []).forEach((t, i) => tables.push({ page: p.url, index: i, caption: t.caption, rows: t.rows }));
  }

  const externalList = Array.from(external.values()).sort((a, b) => b.count - a.count);
  const externalDomains = new Map();
  for (const e of externalList) {
    try {
      const h = new URL(e.url).hostname;
      externalDomains.set(h, (externalDomains.get(h) || 0) + e.count);
      const platform = detectSocial(e.url);
      if (platform && !socials.has(e.url)) socials.set(e.url, { platform, url: e.url, pages: e.foundOn });
    } catch {}
  }

  const resList = Array.from(resources.values());
  const robotsSummary = {};
  for (const [origin, promise] of ctx.robotsCache.entries()) {
    try {
      const r = await promise;
      robotsSummary[origin] = { disallowed: r.disallowed.slice(0, 100), sitemaps: r.sitemaps, crawlDelay: r.crawlDelay };
    } catch {}
  }

  const finishedAt = new Date();
  return {
    meta: {
      start: ctx.start,
      startHost: ctx.startHost,
      rootDomain: ctx.rootDomain,
      startedAt: ctx.startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt - ctx.startedAt,
      aborted: ctx.aborted,
      queueRemaining: ctx.queueRemaining,
      settings: ctx.settings,
      sitemaps: ctx.sitemapInfo
    },
    pages,
    aggregate: {
      hosts: Object.fromEntries(hosts),
      emails: Array.from(emails.values()).sort((a, b) => b.count - a.count),
      phones: Array.from(phones.values()).sort((a, b) => b.count - a.count),
      socials: Array.from(socials.values()),
      tech: Array.from(tech.entries()).sort((a, b) => b[1] - a[1]).map(([name, pagesCount]) => ({ name, pages: pagesCount })),
      forms,
      endpoints: Array.from(endpoints).sort(),
      documents: resList.filter((r) => r.type === 'document'),
      media: resList.filter((r) => r.type === 'media'),
      feeds: resList.filter((r) => r.type === 'feed'),
      staticFiles: resList.filter((r) => r.type === 'static'),
      externalLinks: externalList,
      externalDomains: Array.from(externalDomains.entries()).sort((a, b) => b[1] - a[1]).map(([domain, count]) => ({ domain, count })),
      broken,
      redirects,
      blockedByRobots: ctx.blockedByRobots,
      robots: robotsSummary,
      languages: Array.from(languages),
      jsonLdTypes: Object.fromEntries(jsonLdTypes),
      tables
    }
  };
}
