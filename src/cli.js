import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { createStaticServer } from './verifier.js';
import {
  clearScreen,
  renderBanner,
  playBootAnimation,
  createCloneXSpinner
} from './ui/banner.js';
import { selectFromMenu, closePrompt } from './ui/prompt.js';
import { CLONEX_MODULES } from './modules/index.js';
import { executeCloneJob, getDefaultOutputDir } from './modules/full-clone.js';
import { loadSettings } from './core/config.js';
import { installSigintHandler, beginAbortable, endAbortable } from './core/abort.js';
import { discoverSubdomains } from './core/subdomains.js';
import { crawlSite } from './core/crawler.js';
import { writeCrawlReport } from './core/report.js';
import { updateTargetDashboard } from './core/dashboard.js';
import { mirrorFullWebsite } from './core/mirror.js';

const RED = chalk.hex('#EF4444');
const GOLD = chalk.hex('#FBBF24');
const ARC = chalk.hex('#00E5FF');

const runtimeContext = {
  settings: loadSettings()
};

installSigintHandler(() => closePrompt());

async function startInteractiveMenu(depSummary) {
  await playBootAnimation(depSummary);

  while (true) {
    clearScreen();
    renderBanner();

    const selectedModule = await selectFromMenu(
      'OPERATIONS',
      CLONEX_MODULES
    );

    if (!selectedModule) {
      console.log(`\n  ${RED('◈')} ${GOLD('ARC REACTOR OFFLINE.')}\n`);
      closePrompt();
      process.exit(0);
    }

    clearScreen();
    renderBanner(selectedModule.title.toUpperCase());
    await selectedModule.run(runtimeContext);
  }
}

function normalizeInputUrl(rawUrl) {
  let trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  return new URL(trimmed).href;
}

export async function runCli(depSummary = null) {
  const program = new Command();

  program
    .name('clonex')
    .description('clonex - website cloner, subdomain scanner and scraper')
    .version('2.0.0');

  program
    .argument('[url]', 'Target URL')
    .option('-o, --output <dir>', 'Output directory')
    .option('-W, --width <number>', 'Viewport width', '1440')
    .option('-H, --height <number>', 'Viewport height', '900')
    .option('--wait <ms>', 'Post-scroll dwell ms', '1500')
    .option('--no-scroll', 'Disable auto-scroll')
    .option('--no-assets', 'Skip asset download')
    .option('--no-react', 'Skip React build')
    .option('--no-verify', 'Skip fidelity verification')
    .option('-s, --serve', 'Start local server after capture')
    .option('-p, --port <number>', 'Server port', '4000')
    .action(async (rawUrl, options) => {
      if (!rawUrl) {
        await startInteractiveMenu(depSummary);
        return;
      }

      renderBanner('DIRECT CAPTURE');

      let targetUrl;
      try {
        targetUrl = normalizeInputUrl(rawUrl);
      } catch {
        console.error(RED(`  ✖ Invalid URL: ${rawUrl}`));
        process.exit(1);
      }

      const viewportWidth = parseInt(options.width, 10) || 1440;
      const viewportHeight = parseInt(options.height, 10) || 900;
      const waitExtraMs = parseInt(options.wait, 10) || 1500;
      const outputDir = options.output
        ? path.resolve(process.cwd(), options.output)
        : getDefaultOutputDir(process.cwd(), targetUrl);

      try {
        await executeCloneJob(targetUrl, {
          outputDir,
          viewportWidth,
          viewportHeight,
          waitExtraMs,
          fullScroll: options.scroll,
          downloadAssets: options.assets,
          generateReact: options.react,
          verify: options.verify
        });

        if (options.serve) {
          const port = parseInt(options.port, 10) || 4000;
          const server = createStaticServer(outputDir);
          server.listen(port, '127.0.0.1', () => {
            console.log(
              `  ${chalk.bgHex('#B91C1C').hex('#FBBF24').bold(' ONLINE ')} ${ARC(`http://localhost:${port}`)}`
            );
          });
        } else {
          closePrompt();
        }
      } catch {
        closePrompt();
        process.exit(1);
      }
    });

  program
    .command('recon <url>')
    .description('Deep spider all pages, subdomains, sitemaps, JS endpoints, contacts & content')
    .option('-m, --max-pages <number>', 'Maximum pages to crawl', '250')
    .option('-d, --depth <number>', 'Maximum crawl depth', '6')
    .option('--no-subdomains', 'Disable subdomain enumeration & crawling')
    .option('--browser', 'Use headless Chromium for every page')
    .action(async (rawUrl, opts) => {
      renderBanner('TOTAL SITE RECON');
      const targetUrl = normalizeInputUrl(rawUrl);
      const host = new URL(targetUrl).hostname;
      const baseOut = getDefaultOutputDir(process.cwd(), targetUrl);
      const reconDir = path.join(baseOut, '05-intelligence');
      const token = beginAbortable();
      const spinner = createCloneXSpinner('ENGAGING ECOSYSTEM RECON').start();

      try {
        let subRes = null;
        let extraHosts = [];
        let seedUrls = [];
        if (opts.subdomains) {
          subRes = await discoverSubdomains(host, {
            onProgress: (m) => spinner.update(m),
            shouldStop: () => token.aborted
          });
          extraHosts = subRes.subdomains.filter((s) => s.alive).map((s) => s.host);
          seedUrls = subRes.subdomains.filter((s) => s.alive && s.url).map((s) => s.url);
        }

        const crawlRes = await crawlSite(targetUrl, {
          maxPages: parseInt(opts.maxPages, 10) || 250,
          maxDepth: parseInt(opts.depth, 10) || 6,
          includeSubdomains: Boolean(opts.subdomains),
          extraHosts,
          seedUrls,
          respectRobots: false,
          renderMode: opts.browser ? 'browser' : 'http',
          token,
          onProgress: (m) => spinner.update(m)
        });

        await writeCrawlReport(crawlRes, reconDir, {
          subdomains: subRes?.subdomains,
          archivedUrls: subRes?.archivedUrls
        });
        const dashPath = await updateTargetDashboard(baseOut);

        spinner.succeed(
          `RECON COMPLETE: ${crawlRes.pages.length} PAGES // ${subRes ? subRes.subdomains.length : 1} HOSTS -> ${dashPath}`
        );
      } finally {
        endAbortable();
        closePrompt();
      }
    });

  program
    .command('mirror <url>')
    .description('Clone an entire multi-page website & subdomains 1:1 with offline link rewriting')
    .option('-m, --max-pages <number>', 'Maximum pages to clone', '25')
    .option('-d, --depth <number>', 'Maximum crawl depth', '4')
    .option('-s, --subdomains', 'Include discovered live subdomains')
    .action(async (rawUrl, opts) => {
      renderBanner('FULL SITE MIRROR');
      const targetUrl = normalizeInputUrl(rawUrl);
      const baseOut = getDefaultOutputDir(process.cwd(), targetUrl);
      const mirrorDir = path.join(baseOut, '06-site-mirror');
      const token = beginAbortable();
      const spinner = createCloneXSpinner('ENGAGING MULTI-PAGE MIRROR').start();

      try {
        const res = await mirrorFullWebsite(targetUrl, {
          outputDir: mirrorDir,
          maxPages: parseInt(opts.maxPages, 10) || 25,
          maxDepth: parseInt(opts.depth, 10) || 4,
          includeSubdomains: Boolean(opts.subdomains),
          token,
          onProgress: (m) => spinner.update(m)
        });
        await updateTargetDashboard(baseOut);
        spinner.succeed(
          `MIRROR COMPLETE: ${res.clonedPages.filter((p) => !p.error).length} PAGES -> ${res.dashboardPath}`
        );
      } finally {
        endAbortable();
        closePrompt();
      }
    });

  program
    .command('preview <dir>')
    .description('Start local static server')
    .option('-p, --port <number>', 'Port', '4000')
    .action((dir, opts) => {
      renderBanner('LOCAL SERVER');
      const resolvedDir = path.resolve(process.cwd(), dir);
      const port = parseInt(opts.port, 10) || 4000;
      const server = createStaticServer(resolvedDir);
      server.listen(port, '127.0.0.1', () => {
        console.log(
          `  ${chalk.bgHex('#B91C1C').hex('#FBBF24').bold(' ONLINE ')} ${chalk.white(resolvedDir)} -> ${ARC(`http://localhost:${port}`)}\n`
        );
      });
    });

  await program.parseAsync(process.argv);
}
