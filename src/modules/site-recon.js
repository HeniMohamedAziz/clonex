import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { crawlSite } from '../core/crawler.js';
import { discoverSubdomains } from '../core/subdomains.js';
import { writeCrawlReport } from '../core/report.js';
import { mirrorFullWebsite } from '../core/mirror.js';
import { httpGet, runPool } from '../core/net.js';
import { beginAbortable, endAbortable } from '../core/abort.js';
import { getDefaultOutputDir, executeCloneJob } from './full-clone.js';
import { createCloneXSpinner, printSectionHeader } from '../ui/banner.js';
import { askUrl, selectFromMenu, askInput, pauseForEnter } from '../ui/prompt.js';

const RED = chalk.hex('#EF4444');
const GOLD = chalk.hex('#FBBF24');
const ARC = chalk.hex('#00E5FF');
const DIM = chalk.hex('#52525B');

export async function analyzeWebsiteIntel(targetUrl, onProgress = () => {}) {
  const res = await crawlSite(targetUrl, {
    maxPages: 1,
    maxDepth: 0,
    concurrency: 1,
    respectRobots: false,
    renderMode: 'browser',
    useSitemaps: true,
    scanJs: true,
    onProgress
  });
  const first = res.pages[0] || {};
  return {
    url: first.finalUrl || targetUrl,
    origin: new URL(targetUrl).origin,
    scannedAt: res.meta.finishedAt,
    statusCode: first.status || 200,
    meta: {
      title: first.title || '',
      description: first.description || null,
      keywords: first.keywords || null,
      canonical: first.canonical || null,
      language: first.language || null
    },
    techStack: res.aggregate.tech.map((t) => t.name),
    contacts: {
      emails: res.aggregate.emails.map((e) => e.value),
      phones: res.aggregate.phones.map((p) => p.value),
      socials: res.aggregate.socials
    },
    internalPages: (first.links || [])
      .filter((l) => l.internal)
      .map((l) => ({ url: l.url, path: new URL(l.url).pathname, label: l.text })),
    externalLinks: res.aggregate.externalLinks.map((e) => e.url),
    apiEndpoints: res.aggregate.endpoints,
    forms: res.aggregate.forms,
    headings: first.headings || {},
    sitemap: {
      hasRobotsTxt: Object.keys(res.aggregate.robots || {}).length > 0,
      totalSitemapUrls: res.meta.sitemaps?.urls || 0
    }
  };
}

export const siteReconModule = {
  id: 'site-recon',
  category: 'Intelligence & Extraction',
  title: 'Total Site Recon & Everything Scraper',
  description: 'Subdomains + All Pages + Sitemaps + JS APIs + Docs + Tables + Contacts',

  async run(context) {
    printSectionHeader('Total Site Recon & Everything Scraper');

    const targetUrl = await askUrl('TARGET URL');
    if (!targetUrl) return;

    console.log('');
    const modes = [
      {
        id: 'ecosystem',
        title: 'Full Ecosystem Deep Scrape (Subdomains + Wayback + All Pages + JS APIs)',
        description: 'Discover subdomains, pull archive URLs, spider up to 250 pages across all hosts',
        opts: {
          discoverSubs: true,
          includeSubdomains: true,
          maxPages: 250,
          maxDepth: 6,
          concurrency: 10,
          renderMode: 'http',
          scanJs: true
        }
      },
      {
        id: 'domain',
        title: 'Domain Deep Spider (Up to 200 Pages + Sitemaps + JS Endpoints)',
        description: 'Fast parallel crawl of target domain, sitemaps, tables, Markdown & contacts',
        opts: {
          discoverSubs: false,
          includeSubdomains: false,
          maxPages: 200,
          maxDepth: 5,
          concurrency: 10,
          renderMode: 'http',
          scanJs: true
        }
      },
      {
        id: 'browser-spa',
        title: 'Headless Chromium SPA Deep Crawl (Up to 60 Pages)',
        description: 'Full browser rendering for each page + live XHR/fetch network capture',
        opts: {
          discoverSubs: true,
          includeSubdomains: true,
          maxPages: 60,
          maxDepth: 4,
          concurrency: 4,
          renderMode: 'browser',
          scanJs: true
        }
      },
      {
        id: 'custom',
        title: 'Custom Recon Parameters',
        description: 'Configure max pages, depth, subdomain scope & rendering mode'
      }
    ];

    const chosenMode = await selectFromMenu('RECON PROFILE', modes, { allowBack: true });
    if (!chosenMode) return;

    let cfg = chosenMode.opts ? { ...chosenMode.opts } : null;
    if (chosenMode.id === 'custom') {
      const maxPages = parseInt(await askInput('MAX PAGES', '300'), 10) || 300;
      const maxDepth = parseInt(await askInput('MAX DEPTH', '6'), 10) || 6;
      const subAns = (await askInput('ENUMERATE & CRAWL SUBDOMAINS (y/n)', 'y')).toLowerCase();
      const modeAns = (await askInput('RENDER MODE (http / browser)', 'http')).toLowerCase();
      cfg = {
        discoverSubs: subAns.startsWith('y'),
        includeSubdomains: subAns.startsWith('y'),
        maxPages,
        maxDepth,
        concurrency: modeAns === 'browser' ? 4 : 10,
        renderMode: modeAns === 'browser' ? 'browser' : 'http',
        scanJs: true
      };
    }

    const baseOutDir = getDefaultOutputDir(process.cwd(), targetUrl);
    const reconDir = path.join(baseOutDir, 'recon');
    await fs.mkdir(reconDir, { recursive: true });

    console.log('');
    const token = beginAbortable();
    const spinner = createCloneXSpinner('ENGAGING ECOSYSTEM RECON').start();

    let subdomainData = null;
    let crawlResult = null;

    try {
      const targetHost = new URL(targetUrl).hostname;
      let extraHosts = [];
      let seedUrls = [];

      if (cfg.discoverSubs) {
        subdomainData = await discoverSubdomains(targetHost, {
          useCertificates: true,
          usePassiveApis: true,
          useBruteforce: true,
          useArchive: true,
          probe: true,
          onProgress: (msg) => spinner.update(msg),
          shouldStop: () => token.aborted
        });

        extraHosts = subdomainData.subdomains
          .filter((s) => s.alive)
          .map((s) => s.host);

        for (const sub of subdomainData.subdomains) {
          if (sub.alive && sub.url) seedUrls.push(sub.url);
        }

        for (const arch of (subdomainData.archivedUrls || []).slice(0, 150)) {
          if (arch.mime && arch.mime.includes('html')) {
            seedUrls.push(arch.url);
          }
        }
      }

      crawlResult = await crawlSite(targetUrl, {
        maxPages: cfg.maxPages,
        maxDepth: cfg.maxDepth,
        concurrency: cfg.concurrency,
        delayMs: 40,
        includeSubdomains: cfg.includeSubdomains,
        extraHosts,
        respectRobots: false,
        renderMode: cfg.renderMode,
        useSitemaps: true,
        seedUrls,
        scanJs: cfg.scanJs,
        token,
        onProgress: (msg) => spinner.update(msg)
      });

      spinner.update('COMPILING INTELLIGENCE DOSSIER & EXPORTS...');
      await writeCrawlReport(crawlResult, reconDir, {
        subdomains: subdomainData?.subdomains || null,
        archivedUrls: subdomainData?.archivedUrls || null
      });

      const dur = (crawlResult.meta.durationMs / 1000).toFixed(1);
      spinner.succeed(
        `RECON COMPLETE: ${crawlResult.pages.length} PAGES // ${Object.keys(crawlResult.aggregate.hosts).length} HOSTS [${dur}s]`
      );
    } catch (err) {
      spinner.fail(`RECON ABORTED: ${err.message}`);
      endAbortable();
      await pauseForEnter();
      return;
    } finally {
      endAbortable();
    }

    const a = crawlResult.aggregate;
    const totalWords = crawlResult.pages.reduce((s, p) => s + (p.wordCount || 0), 0);
    const aliveSubs = subdomainData
      ? subdomainData.subdomains.filter((s) => s.alive).length
      : 0;

    console.log(`\n  ${RED.bold('▸ ECOSYSTEM TELEMETRY')}`);
    if (subdomainData) {
      console.log(
        `   ${ARC('◈')} ${GOLD('SUBDOMAINS     ')} ${ARC.bold(subdomainData.subdomains.length)} discovered (${aliveSubs} live HTTP/HTTPS)`
      );
      console.log(
        `   ${ARC('◈')} ${GOLD('WAYBACK URLS   ')} ${chalk.white(subdomainData.archivedUrls.length)} historical endpoints`
      );
    }
    console.log(
      `   ${ARC('◈')} ${GOLD('PAGES CRAWLED  ')} ${ARC.bold(crawlResult.pages.length)} pages (${totalWords.toLocaleString()} words extracted to Markdown)`
    );
    console.log(
      `   ${ARC('◈')} ${GOLD('HOSTS MAPPED   ')} ${chalk.white(Object.keys(a.hosts).join(', '))}`
    );
    console.log(
      `   ${ARC('◈')} ${GOLD('TECH STACK     ')} ${ARC(a.tech.slice(0, 10).map((t) => t.name).join(' // ') || 'Static HTML/CSS')}`
    );
    console.log(
      `   ${ARC('◈')} ${GOLD('API ENDPOINTS  ')} ${ARC.bold(a.endpoints.length)} endpoints extracted from HTML & JS bundles`
    );
    console.log(
      `   ${ARC('◈')} ${GOLD('DOCUMENTS      ')} ${chalk.white(a.documents.length)} files (PDF/DOCX/XLSX/ZIP/CSV)`
    );
    console.log(
      `   ${ARC('◈')} ${GOLD('MEDIA ASSETS   ')} ${chalk.white(a.media.length)} images/videos/vectors`
    );
    console.log(
      `   ${ARC('◈')} ${GOLD('EXTERNAL LINKS ')} ${chalk.white(`${a.externalLinks.length} links across ${a.externalDomains.length} domains`)}`
    );
    console.log(
      `   ${ARC('◈')} ${GOLD('CONTACTS       ')} ${chalk.white(`${a.emails.length} emails | ${a.phones.length} phones | ${a.socials.length} social profiles`)}`
    );
    console.log(
      `   ${ARC('◈')} ${GOLD('FORMS & TABLES ')} ${chalk.white(`${a.forms.length} forms | ${a.tables.length} HTML tables exported to CSV`)}`
    );

    console.log(`\n  ${RED.bold('▸ DOSSIER ARTIFACTS')}`);
    console.log(`   ${DIM('REPORT   //')} ${chalk.white(path.join(reconDir, 'REPORT.md'))}`);
    console.log(`   ${DIM('PAGES    //')} ${chalk.white(path.join(reconDir, 'pages.csv'))}`);
    console.log(`   ${DIM('CONTENT  //')} ${chalk.white(path.join(reconDir, 'content'))} ${DIM('(Markdown per page)')}`);
    console.log(`   ${DIM('CONTACTS //')} ${chalk.white(path.join(reconDir, 'contacts.csv'))}`);
    console.log(`   ${DIM('LINKS    //')} ${chalk.white(path.join(reconDir, 'links'))}`);
    if (subdomainData) {
      console.log(`   ${DIM('SUBS     //')} ${chalk.white(path.join(reconDir, 'subdomains.csv'))}`);
    }
    console.log('');

    while (true) {
      const subOptions = [
        {
          id: 'subs',
          title: `Subdomains & Live Hosts [${subdomainData ? subdomainData.subdomains.length : Object.keys(a.hosts).length}]`,
          description: 'View all discovered subdomains, IPs, status codes & server headers'
        },
        {
          id: 'pages',
          title: `Crawled Pages & Routes [${crawlResult.pages.length}]`,
          description: 'Browse all scraped URLs, titles, word counts & status codes'
        },
        {
          id: 'contacts',
          title: `Contacts, Socials & Forms [${a.emails.length + a.phones.length + a.socials.length + a.forms.length}]`,
          description: 'View extracted emails, phone numbers, social accounts & forms'
        },
        {
          id: 'apis',
          title: `API Endpoints & Documents [${a.endpoints.length + a.documents.length}]`,
          description: 'View JS-extracted API routes, GraphQL/REST endpoints & document URLs'
        },
        {
          id: 'download-all',
          title: `Bulk Download Discovered Documents & Media [${a.documents.length + a.media.length}]`,
          description: 'Download all PDFs, Office docs, archives & media files to disk'
        },
        {
          id: 'mirror-site',
          title: '1:1 Clone All Discovered Pages / Subdomains',
          description: 'Mirror the crawled pages into offline 1:1 HTML/CSS + React'
        },
        {
          id: 'open-folder',
          title: 'Open Intelligence Dossier in Explorer',
          description: reconDir
        }
      ];

      const action = await selectFromMenu('RECON OPERATIONS', subOptions, {
        allowBack: true
      });
      if (!action) break;

      if (action.id === 'subs') {
        if (subdomainData && subdomainData.subdomains.length > 0) {
          console.log(`\n  ${RED.bold(`▸ SUBDOMAINS [${subdomainData.subdomains.length}]`)}`);
          subdomainData.subdomains.slice(0, 100).forEach((s, i) => {
            const badge = s.alive ? ARC(`[${s.status}]`) : DIM('[DEAD]');
            const ips = (s.ips || []).slice(0, 2).join(', ');
            console.log(
              `   ${GOLD(`[${i + 1}]`)} ${badge} ${chalk.white.bold(s.host.padEnd(32, ' '))} ${DIM(ips.padEnd(16, ' '))} ${GOLD(s.title || '')}`
            );
          });
        } else {
          console.log(`\n  ${RED.bold('▸ HOSTS')}`);
          Object.entries(a.hosts).forEach(([h, count]) => {
            console.log(`   ${ARC('◈')} ${chalk.white.bold(h.padEnd(32, ' '))} ${GOLD(`${count} pages`)}`);
          });
        }
        await pauseForEnter();
      } else if (action.id === 'pages') {
        console.log(`\n  ${RED.bold(`▸ CRAWLED PAGES [${crawlResult.pages.length}]`)}`);
        crawlResult.pages.slice(0, 100).forEach((p, idx) => {
          console.log(
            `   ${GOLD(`[${idx + 1}]`)} ${ARC(`[${p.status}]`)} ${chalk.white(p.url.slice(0, 68).padEnd(70, ' '))} ${DIM(`${p.wordCount || 0}w`)}`
          );
        });
        await pauseForEnter();
      } else if (action.id === 'contacts') {
        console.log(`\n  ${RED.bold(`▸ EMAILS [${a.emails.length}]`)}`);
        a.emails.slice(0, 50).forEach((e) => {
          console.log(`   ${ARC('◈')} ${GOLD(e.value.padEnd(36, ' '))} ${DIM(`(${e.count}x)`)}`);
        });
        console.log(`\n  ${RED.bold(`▸ PHONES [${a.phones.length}]`)}`);
        a.phones.slice(0, 50).forEach((p) => {
          console.log(`   ${ARC('◈')} ${GOLD(p.value.padEnd(24, ' '))} ${DIM(`(${p.count}x)`)}`);
        });
        console.log(`\n  ${RED.bold(`▸ SOCIAL PROFILES [${a.socials.length}]`)}`);
        a.socials.forEach((s) => {
          console.log(`   ${ARC('◈')} ${GOLD(s.platform.padEnd(14, ' '))} ${chalk.white(s.url)}`);
        });
        if (a.forms.length > 0) {
          console.log(`\n  ${RED.bold(`▸ FORMS [${a.forms.length}]`)}`);
          a.forms.slice(0, 25).forEach((f) => {
            console.log(
              `   ${ARC('◈')} ${GOLD(`${f.method} ${f.action}`)} ${DIM(`fields: ${f.fields.map((x) => x.name || x.type).join(', ')}`)}`
            );
          });
        }
        await pauseForEnter();
      } else if (action.id === 'apis') {
        console.log(`\n  ${RED.bold(`▸ API / XHR / JS ENDPOINTS [${a.endpoints.length}]`)}`);
        a.endpoints.slice(0, 80).forEach((ep) => {
          console.log(`   ${ARC('◈')} ${chalk.white(ep)}`);
        });
        if (a.documents.length > 0) {
          console.log(`\n  ${RED.bold(`▸ DOCUMENTS [${a.documents.length}]`)}`);
          a.documents.slice(0, 50).forEach((d) => {
            console.log(`   ${GOLD('◈')} ${chalk.white(d.url)}`);
          });
        }
        await pauseForEnter();
      } else if (action.id === 'download-all') {
        const dumpDir = path.join(reconDir, 'downloaded-files');
        await fs.mkdir(dumpDir, { recursive: true });
        const targets = [
          ...a.documents.map((d) => ({ url: d.url, folder: 'documents' })),
          ...a.media.slice(0, 200).map((m) => ({ url: m.url, folder: 'media' }))
        ];
        if (targets.length === 0) {
          console.log(GOLD('\n  No downloadable document/media URLs in this scan.'));
          await pauseForEnter();
          continue;
        }
        const dlSpinner = createCloneXSpinner(`DOWNLOADING ${targets.length} FILES`).start();
        let saved = 0;
        await runPool(targets, 10, async (item, idx) => {
          const sub = path.join(dumpDir, item.folder);
          await fs.mkdir(sub, { recursive: true });
          const res = await httpGet(item.url, { asBuffer: true, timeoutMs: 20000 });
          if (res.ok && res.body) {
            const name =
              path.basename(new URL(item.url).pathname).replace(/[^a-zA-Z0-9._-]/g, '_') ||
              `file_${idx + 1}.bin`;
            await fs.writeFile(path.join(sub, `${idx + 1}_${name}`), res.body);
            saved++;
            dlSpinner.update(`DOWNLOADED [${saved}/${targets.length}] ${name}`);
          }
        });
        dlSpinner.succeed(`DOWNLOADED ${saved} FILES -> ${dumpDir}`);
        await pauseForEnter();
      } else if (action.id === 'mirror-site') {
        const limitStr = await askInput('MAX PAGES TO 1:1 CLONE', String(Math.min(25, crawlResult.pages.length)));
        const limit = Math.max(1, parseInt(limitStr, 10) || 15);
        const mirrorDir = path.join(baseOutDir, 'mirror');
        const mToken = beginAbortable();
        const mSpinner = createCloneXSpinner('MIRRORING DISCOVERED PAGES').start();
        try {
          const res = await mirrorFullWebsite(targetUrl, {
            outputDir: mirrorDir,
            maxPages: limit,
            maxDepth: 4,
            includeSubdomains: cfg.includeSubdomains,
            viewportWidth: context.settings.viewportWidth,
            viewportHeight: context.settings.viewportHeight,
            waitExtraMs: context.settings.waitExtraMs,
            fullScroll: context.settings.fullScroll,
            token: mToken,
            onProgress: (msg) => mSpinner.update(msg)
          });
          mSpinner.succeed(`MIRRORED ${res.clonedPages.filter((p) => !p.error).length} PAGES -> ${mirrorDir}`);
        } catch (err) {
          mSpinner.fail(`MIRROR ERROR: ${err.message}`);
        } finally {
          endAbortable();
        }
        await pauseForEnter();
      } else if (action.id === 'open-folder') {
        if (process.platform === 'win32') {
          spawn('explorer.exe', [reconDir], { detached: true, stdio: 'ignore' }).unref();
        }
      }
    }
  }
};
