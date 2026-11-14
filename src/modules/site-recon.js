import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import * as cheerio from 'cheerio';
import chalk from 'chalk';
import { launchBrowser } from '../browser-finder.js';
import { getDefaultOutputDir, executeCloneJob } from './full-clone.js';
import { createCloneXSpinner, printSectionHeader } from '../ui/banner.js';
import { askUrl, selectFromMenu, askInput, pauseForEnter } from '../ui/prompt.js';

const RED = chalk.hex('#EF4444');
const GOLD = chalk.hex('#FBBF24');
const ARC = chalk.hex('#00E5FF');
const DIM = chalk.hex('#52525B');

const SOCIAL_DOMAINS = [
  { name: 'GitHub', pattern: /github\.com\//i },
  { name: 'X/Twitter', pattern: /(twitter\.com|x\.com)\//i },
  { name: 'LinkedIn', pattern: /linkedin\.com\//i },
  { name: 'Instagram', pattern: /instagram\.com\//i },
  { name: 'YouTube', pattern: /youtube\.com\//i },
  { name: 'Discord', pattern: /(discord\.gg|discord\.com\/invite)\//i },
  { name: 'Facebook', pattern: /facebook\.com\//i },
  { name: 'TikTok', pattern: /tiktok\.com\//i },
  { name: 'Telegram', pattern: /t\.me\//i }
];

async function fetchTextSafe(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      },
      signal: controller.signal
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function discoverRobotsAndSitemap(originUrl) {
  const robotsUrl = `${originUrl}/robots.txt`;
  const defaultSitemapUrl = `${originUrl}/sitemap.xml`;
  const sitemapUrls = new Set();
  const sitemapPages = new Set();
  const disallowedPaths = [];

  const robotsTxt = await fetchTextSafe(robotsUrl);
  if (robotsTxt) {
    for (const line of robotsTxt.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (/^sitemap:/i.test(trimmed)) {
        const sm = trimmed.replace(/^sitemap:\s*/i, '').trim();
        if (sm) sitemapUrls.add(sm);
      } else if (/^disallow:/i.test(trimmed)) {
        const dis = trimmed.replace(/^disallow:\s*/i, '').trim();
        if (dis && dis !== '/') disallowedPaths.push(dis);
      }
    }
  }

  if (sitemapUrls.size === 0) {
    sitemapUrls.add(defaultSitemapUrl);
  }

  for (const smUrl of Array.from(sitemapUrls).slice(0, 3)) {
    const xml = await fetchTextSafe(smUrl);
    if (xml && xml.includes('<loc>')) {
      const locRegex = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
      let match;
      while ((match = locRegex.exec(xml)) !== null) {
        const loc = match[1].trim();
        if (loc.endsWith('.xml')) {
          sitemapUrls.add(loc);
        } else {
          sitemapPages.add(loc);
        }
      }
    }
  }

  return {
    hasRobotsTxt: Boolean(robotsTxt),
    disallowedPaths: Array.from(new Set(disallowedPaths)).slice(0, 30),
    sitemapPages: Array.from(sitemapPages).slice(0, 250)
  };
}

export async function analyzeWebsiteIntel(targetUrl, onProgress = () => {}) {
  const parsedTarget = new URL(targetUrl);
  const origin = parsedTarget.origin;

  onProgress('ENGAGING BROWSER & NETWORK INTERCEPT');
  const browser = await launchBrowser(['--disable-web-security']);

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      ignoreHTTPSErrors: true
    });
    const page = await context.newPage();

    let mainResponseHeaders = {};
    let statusCode = null;
    const apiAndScriptUrls = new Set();

    page.on('response', (res) => {
      const url = res.url();
      const type = res.request().resourceType();
      if (url === targetUrl || url === `${targetUrl}/` || !statusCode) {
        statusCode = res.status();
        mainResponseHeaders = res.headers();
      }
      if (type === 'xhr' || type === 'fetch') {
        apiAndScriptUrls.add(url);
      }
    });

    onProgress(`SCANNING ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => {
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);
    });

    onProgress('EXTRACTING ROUTES, ENDPOINTS & FINGERPRINTS');

    const pageData = await page.evaluate(() => {
      const getMeta = (selector) =>
        document.querySelector(selector)?.getAttribute('content')?.trim() || null;

      const meta = {
        title: document.title || '',
        description:
          getMeta('meta[name="description"]') ||
          getMeta('meta[property="og:description"]'),
        keywords: getMeta('meta[name="keywords"]'),
        author: getMeta('meta[name="author"]'),
        generator: getMeta('meta[name="generator"]'),
        themeColor: getMeta('meta[name="theme-color"]'),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || null,
        language: document.documentElement.getAttribute('lang') || null,
        ogTitle: getMeta('meta[property="og:title"]'),
        ogType: getMeta('meta[property="og:type"]'),
        ogImage: getMeta('meta[property="og:image"]'),
        ogSiteName: getMeta('meta[property="og:site_name"]'),
        twitterCard: getMeta('meta[name="twitter:card"]'),
        twitterSite: getMeta('meta[name="twitter:site"]')
      };

      const techStack = new Set();
      if (window.__NEXT_DATA__ || document.getElementById('__next')) techStack.add('Next.js');
      if (window.__NUXT__ || document.getElementById('__nuxt')) techStack.add('Nuxt.js');
      if (window.__remixContext) techStack.add('Remix');
      if (document.querySelector('[data-astro-cid]') || document.querySelector('astro-island'))
        techStack.add('Astro');
      if (
        window.React ||
        document.querySelector('[data-reactroot], [data-reactid]') ||
        Array.from(document.scripts).some((s) => /react/i.test(s.src))
      )
        techStack.add('React');
      if (window.Vue || document.querySelector('[data-v-]')) techStack.add('Vue.js');
      if (window.angular || document.querySelector('[ng-version], [ng-app]'))
        techStack.add('Angular');
      if (document.querySelector('[class*="svelte-"]')) techStack.add('Svelte');
      if (window.Shopify || document.querySelector('link[href*="cdn.shopify.com"]'))
        techStack.add('Shopify');
      if (
        document.querySelector('link[href*="wp-content"], script[src*="wp-includes"]') ||
        /wordpress/i.test(meta.generator || '')
      )
        techStack.add('WordPress');
      if (document.querySelector('html[data-wf-site], html[data-wf-page]'))
        techStack.add('Webflow');
      if (document.querySelector('[data-framer-appear-id], [name="framer-search-index"]'))
        techStack.add('Framer');
      if (window.jQuery || window.$?.fn?.jquery) techStack.add('jQuery');
      if (window.gsap) techStack.add('GSAP');
      if (window.THREE) techStack.add('Three.js');
      if (
        document.querySelector(
          '.flex, .grid, .items-center, .justify-between, .text-sm, .bg-white'
        )
      )
        techStack.add('Tailwind CSS');
      if (document.querySelector('link[href*="bootstrap"], .container-fluid, .row .col-md-'))
        techStack.add('Bootstrap');
      if (
        window.gtag ||
        window.ga ||
        window.dataLayer ||
        Array.from(document.scripts).some((s) => /googletagmanager|google-analytics/i.test(s.src))
      )
        techStack.add('Google Analytics');

      const rawLinks = Array.from(document.querySelectorAll('a[href]')).map((a) => ({
        href: a.getAttribute('href') || '',
        text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 80)
      }));

      const forms = Array.from(document.querySelectorAll('form')).map((f) => ({
        action: f.getAttribute('action') || window.location.pathname,
        method: (f.getAttribute('method') || 'GET').toUpperCase(),
        inputs: Array.from(f.querySelectorAll('input, select, textarea'))
          .map((i) => i.name || i.type || i.id)
          .filter(Boolean)
      }));

      const scripts = Array.from(document.querySelectorAll('script[src]'))
        .map((s) => s.src)
        .filter(Boolean);

      const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
        .map((h) => ({
          tag: h.tagName.toLowerCase(),
          text: (h.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 120)
        }))
        .filter((h) => h.text.length > 0)
        .slice(0, 40);

      const bodyText = document.body?.innerText || '';
      const emailMatches =
        bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      const phoneMatches =
        bodyText.match(/(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]\d{3,4}/g) || [];

      const jsonLd = Array.from(
        document.querySelectorAll('script[type="application/ld+json"]')
      )
        .map((s) => {
          try {
            return JSON.parse(s.textContent);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      return {
        finalUrl: window.location.href,
        meta,
        techStack: Array.from(techStack),
        rawLinks,
        forms,
        scripts,
        headings,
        emailMatches,
        phoneMatches,
        jsonLd
      };
    });

    onProgress('PROBING ROBOTS.TXT & SITEMAP.XML');
    const sitemapInfo = await discoverRobotsAndSitemap(origin);

    const internalPagesMap = new Map();
    const externalLinksSet = new Set();
    const socialLinks = [];
    const emails = new Set(pageData.emailMatches.map((e) => e.toLowerCase()));
    const phones = new Set(pageData.phoneMatches.map((p) => p.trim()));

    for (const item of pageData.rawLinks) {
      const raw = item.href.trim();
      if (!raw || raw.startsWith('#') || raw.startsWith('javascript:')) continue;

      if (raw.startsWith('mailto:')) {
        const mail = raw.replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
        if (mail) emails.add(mail);
        continue;
      }
      if (raw.startsWith('tel:')) {
        const tel = raw.replace(/^tel:/i, '').trim();
        if (tel) phones.add(tel);
        continue;
      }

      try {
        const resolved = new URL(raw, pageData.finalUrl);
        resolved.hash = '';
        const cleanUrl = resolved.href;

        if (resolved.origin === origin) {
          if (!internalPagesMap.has(cleanUrl)) {
            internalPagesMap.set(cleanUrl, item.text || resolved.pathname);
          }
        } else if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
          externalLinksSet.add(cleanUrl);
          for (const soc of SOCIAL_DOMAINS) {
            if (soc.pattern.test(cleanUrl)) {
              if (!socialLinks.some((s) => s.url === cleanUrl)) {
                socialLinks.push({ platform: soc.name, url: cleanUrl });
              }
            }
          }
        }
      } catch {}
    }

    for (const smPageUrl of sitemapInfo.sitemapPages) {
      try {
        const u = new URL(smPageUrl, origin);
        if (u.origin === origin && !internalPagesMap.has(u.href)) {
          internalPagesMap.set(u.href, u.pathname);
        }
      } catch {}
    }

    const serverHeader = mainResponseHeaders['server'] || null;
    const poweredBy = mainResponseHeaders['x-powered-by'] || null;
    if (serverHeader) pageData.techStack.push(`Server: ${serverHeader}`);
    if (poweredBy) pageData.techStack.push(`Powered-By: ${poweredBy}`);
    if (mainResponseHeaders['cf-ray']) pageData.techStack.push('Cloudflare');
    if (mainResponseHeaders['x-vercel-id']) pageData.techStack.push('Vercel');
    if (mainResponseHeaders['x-nf-request-id']) pageData.techStack.push('Netlify');

    const internalPages = Array.from(internalPagesMap.entries()).map(([url, label]) => ({
      url,
      path: new URL(url).pathname,
      label
    }));

    return {
      url: pageData.finalUrl,
      origin,
      scannedAt: new Date().toISOString(),
      statusCode,
      meta: pageData.meta,
      techStack: Array.from(new Set(pageData.techStack)),
      headers: {
        server: serverHeader,
        poweredBy,
        contentType: mainResponseHeaders['content-type'] || null,
        cacheControl: mainResponseHeaders['cache-control'] || null,
        strictTransportSecurity: mainResponseHeaders['strict-transport-security'] || null,
        contentSecurityPolicy: mainResponseHeaders['content-security-policy'] ? 'Present' : 'None'
      },
      contacts: {
        emails: Array.from(emails),
        phones: Array.from(phones),
        socials: socialLinks
      },
      internalPages,
      externalLinks: Array.from(externalLinksSet),
      apiEndpoints: Array.from(apiAndScriptUrls),
      scripts: pageData.scripts,
      forms: pageData.forms,
      headings: pageData.headings,
      sitemap: {
        hasRobotsTxt: sitemapInfo.hasRobotsTxt,
        disallowedPaths: sitemapInfo.disallowedPaths,
        totalSitemapUrls: sitemapInfo.sitemapPages.length
      },
      jsonLd: pageData.jsonLd
    };
  } finally {
    await browser.close();
  }
}

async function deepCrawlInternalLinks(origin, seedUrls, maxPages = 15, onProgress = () => {}) {
  const visited = new Set();
  const discovered = new Map();
  const queue = [...seedUrls];

  for (const u of seedUrls) {
    discovered.set(u.url, u.label || new URL(u.url).pathname);
  }

  let crawledCount = 0;
  while (queue.length > 0 && crawledCount < maxPages) {
    const current = queue.shift();
    if (!current || visited.has(current.url)) continue;
    visited.add(current.url);
    crawledCount++;

    onProgress(`SPIDERING [${crawledCount}/${maxPages}] ${current.path || current.url}`);
    const html = await fetchTextSafe(current.url, 7000);
    if (!html) continue;

    try {
      const $ = cheerio.load(html);
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim().replace(/\s+/g, ' ').slice(0, 60);
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
        try {
          const resolved = new URL(href, current.url);
          resolved.hash = '';
          if (resolved.origin === origin && !discovered.has(resolved.href)) {
            discovered.set(resolved.href, text || resolved.pathname);
            queue.push({ url: resolved.href, path: resolved.pathname, label: text });
          }
        } catch {}
      });
    } catch {}
  }

  return Array.from(discovered.entries()).map(([url, label]) => ({
    url,
    path: new URL(url).pathname,
    label
  }));
}

function formatMarkdownReport(intel) {
  const lines = [
    `# Site Recon: ${intel.url}`,
    ``,
    `- **Timestamp:** ${intel.scannedAt}`,
    `- **HTTP Status:** ${intel.statusCode || '200'}`,
    `- **Title:** ${intel.meta.title || 'N/A'}`,
    `- **Description:** ${intel.meta.description || 'N/A'}`,
    `- **Canonical:** ${intel.meta.canonical || 'N/A'}`,
    `- **Language:** ${intel.meta.language || 'N/A'}`,
    ``,
    `## Stack & Infrastructure`,
    intel.techStack.length > 0
      ? intel.techStack.map((t) => `- ${t}`).join('\n')
      : '- Static HTML/CSS/JS',
    ``,
    `## Contacts & Profiles`,
    `- **Emails:** ${intel.contacts.emails.join(', ') || 'None'}`,
    `- **Phones:** ${intel.contacts.phones.join(', ') || 'None'}`,
    ...(intel.contacts.socials || []).map((s) => `- **${s.platform}:** ${s.url}`),
    ``,
    `## Internal Routes (${intel.internalPages.length})`,
    ...intel.internalPages.map((p) => `- [${p.path}](${p.url})`),
    ``,
    `## External Links (${intel.externalLinks.length})`,
    ...intel.externalLinks.map((u) => `- ${u}`),
    ``,
    `## XHR / API Endpoints (${intel.apiEndpoints.length})`,
    ...intel.apiEndpoints.map((u) => `- \`${u}\``),
    ``,
    `## Headings`,
    ...intel.headings.map((h) => `- **${h.tag.toUpperCase()}**: ${h.text}`)
  ];
  return lines.join('\n');
}

export const siteReconModule = {
  id: 'site-recon',
  category: 'Intelligence & Extraction',
  title: 'Site Recon & Route Extractor',
  description: 'Internal Routes + Sitemap + Outbound Links + APIs + Stack',

  async run(context) {
    printSectionHeader('Site Recon & Route Extractor');

    const targetUrl = await askUrl('TARGET URL');
    if (!targetUrl) return;

    const baseOutDir = getDefaultOutputDir(process.cwd(), targetUrl);
    const reconDir = path.join(baseOutDir, 'recon');
    await fs.mkdir(reconDir, { recursive: true });

    console.log('');
    const spinner = createCloneXSpinner('ENGAGING SITE RECON').start();

    let intel;
    try {
      intel = await analyzeWebsiteIntel(targetUrl, (msg) => spinner.update(msg));
    } catch (err) {
      spinner.fail(`RECON ABORTED: ${err.message}`);
      await pauseForEnter();
      return;
    }

    const saveReports = async (data) => {
      const jsonPath = path.join(reconDir, 'site-intel.json');
      const mdPath = path.join(reconDir, 'site-intel.md');
      const linksTxtPath = path.join(reconDir, 'all-links.txt');

      const allLinksText = [
        `[INTERNAL ROUTES: ${data.internalPages.length}]`,
        ...data.internalPages.map((p) => p.url),
        ``,
        `[EXTERNAL LINKS: ${data.externalLinks.length}]`,
        ...data.externalLinks,
        ``,
        `[API ENDPOINTS: ${data.apiEndpoints.length}]`,
        ...data.apiEndpoints
      ].join('\n');

      await fs.writeFile(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.writeFile(mdPath, formatMarkdownReport(data), 'utf-8');
      await fs.writeFile(linksTxtPath, allLinksText, 'utf-8');
      return { jsonPath, mdPath, linksTxtPath };
    };

    const reportPaths = await saveReports(intel);
    spinner.succeed(`RECON COMPLETE: "${intel.meta.title || intel.url}"`);

    console.log(`\n  ${RED.bold('▸ TELEMETRY')}`);
    console.log(`   ${ARC('◈')} ${GOLD('TITLE          ')} ${chalk.white(intel.meta.title || 'N/A')}`);
    console.log(
      `   ${ARC('◈')} ${GOLD('STACK          ')} ${ARC(intel.techStack.join(' // ') || 'Static HTML/CSS')}`
    );
    console.log(
      `   ${ARC('◈')} ${GOLD('SITEMAP        ')} ${chalk.white(`${intel.sitemap.totalSitemapUrls} URLs`)} ${DIM(intel.sitemap.hasRobotsTxt ? '[robots.txt active]' : '[no robots.txt]')}`
    );
    console.log(
      `   ${ARC('◈')} ${GOLD('INTERNAL PAGES ')} ${ARC.bold(intel.internalPages.length)}`
    );
    console.log(
      `   ${ARC('◈')} ${GOLD('EXTERNAL LINKS ')} ${chalk.white(intel.externalLinks.length)}`
    );
    console.log(
      `   ${ARC('◈')} ${GOLD('API ENDPOINTS  ')} ${chalk.white(intel.apiEndpoints.length)}`
    );
    console.log(
      `   ${ARC('◈')} ${GOLD('CONTACTS       ')} ${chalk.white(
        [...intel.contacts.emails, ...intel.contacts.phones].join(', ') || 'None'
      )}`
    );
    if (intel.contacts.socials.length > 0) {
      console.log(
        `   ${ARC('◈')} ${GOLD('SOCIALS        ')} ${chalk.white(
          intel.contacts.socials.map((s) => `${s.platform}: ${s.url}`).join(' | ')
        )}`
      );
    }

    console.log(`\n  ${RED.bold('▸ LOGS')}`);
    console.log(`   ${DIM('JSON  //')} ${chalk.white(reportPaths.jsonPath)}`);
    console.log(`   ${DIM('MD    //')} ${chalk.white(reportPaths.mdPath)}`);
    console.log(`   ${DIM('LINKS //')} ${chalk.white(reportPaths.linksTxtPath)}\n`);

    while (true) {
      const subOptions = [
        {
          id: 'list-pages',
          title: `Internal Routes [${intel.internalPages.length}]`,
          description: 'List discovered site routes'
        },
        {
          id: 'list-external',
          title: `External Links & APIs [${intel.externalLinks.length + intel.apiEndpoints.length}]`,
          description: 'Outbound URLs & XHR endpoints'
        },
        {
          id: 'spider',
          title: 'Deep Spider Crawl',
          description: 'Recursively crawl internal links'
        },
        {
          id: 'clone-page',
          title: 'Clone Discovered Route',
          description: '1:1 clone a single route or batch top 5'
        },
        {
          id: 'open-folder',
          title: 'Open Recon Directory',
          description: reconDir
        }
      ];

      const action = await selectFromMenu('RECON OPERATIONS', subOptions, {
        allowBack: true
      });

      if (!action) break;

      if (action.id === 'list-pages') {
        console.log(`\n  ${RED.bold(`▸ INTERNAL ROUTES [${intel.internalPages.length}]`)}`);
        intel.internalPages.slice(0, 80).forEach((p, idx) => {
          console.log(
            `   ${GOLD(`[${idx + 1}]`)} ${ARC(p.path.padEnd(32, ' '))} ${DIM(p.url)}`
          );
        });
        await pauseForEnter();
      } else if (action.id === 'list-external') {
        console.log(`\n  ${RED.bold(`▸ EXTERNAL LINKS [${intel.externalLinks.length}]`)}`);
        intel.externalLinks.slice(0, 50).forEach((u, idx) => {
          console.log(`   ${GOLD(`[${idx + 1}]`)} ${chalk.white(u)}`);
        });
        if (intel.apiEndpoints.length > 0) {
          console.log(`\n  ${RED.bold(`▸ API / XHR ENDPOINTS [${intel.apiEndpoints.length}]`)}`);
          intel.apiEndpoints.slice(0, 30).forEach((u) => {
            console.log(`   ${ARC('◈')} ${chalk.white(u)}`);
          });
        }
        await pauseForEnter();
      } else if (action.id === 'spider') {
        const limitStr = await askInput('MAX PAGES', '15');
        const maxPages = Math.min(100, Math.max(1, parseInt(limitStr, 10) || 15));
        console.log('');
        const crawlSpinner = createCloneXSpinner('ENGAGING SPIDER').start();
        const expandedPages = await deepCrawlInternalLinks(
          intel.origin,
          intel.internalPages,
          maxPages,
          (msg) => crawlSpinner.update(msg)
        );
        intel.internalPages = expandedPages;
        await saveReports(intel);
        crawlSpinner.succeed(`SPIDER COMPLETE: ${intel.internalPages.length} ROUTES INDEXED`);
        console.log('');
      } else if (action.id === 'clone-page') {
        const pageChoices = [
          {
            id: '__batch_top_5__',
            title: 'Batch Clone Top 5 Routes',
            description: 'Sequential 1:1 capture'
          },
          ...intel.internalPages.slice(0, 30).map((p) => ({
            id: p.url,
            title: p.path || '/',
            description: p.url
          }))
        ];

        const chosenPage = await selectFromMenu('SELECT TARGET ROUTE', pageChoices, {
          allowBack: true
        });

        if (chosenPage) {
          if (chosenPage.id === '__batch_top_5__') {
            const batchPages = intel.internalPages.slice(0, 5);
            for (const p of batchPages) {
              const out = getDefaultOutputDir(process.cwd(), p.url);
              await executeCloneJob(p.url, {
                outputDir: out,
                viewportWidth: context.settings.viewportWidth,
                viewportHeight: context.settings.viewportHeight,
                waitExtraMs: context.settings.waitExtraMs,
                fullScroll: context.settings.fullScroll,
                downloadAssets: true,
                generateReact: true,
                verify: false
              });
            }
          } else {
            const out = getDefaultOutputDir(process.cwd(), chosenPage.id);
            await executeCloneJob(chosenPage.id, {
              outputDir: out,
              viewportWidth: context.settings.viewportWidth,
              viewportHeight: context.settings.viewportHeight,
              waitExtraMs: context.settings.waitExtraMs,
              fullScroll: context.settings.fullScroll,
              downloadAssets: true,
              generateReact: true,
              verify: true
            });
          }
          await pauseForEnter();
        }
      } else if (action.id === 'open-folder') {
        if (process.platform === 'win32') {
          spawn('explorer.exe', [reconDir], { detached: true, stdio: 'ignore' }).unref();
        }
      }
    }
  }
};
