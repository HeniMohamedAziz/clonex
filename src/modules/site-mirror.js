import path from 'path';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { mirrorFullWebsite } from '../core/mirror.js';
import { discoverSubdomains } from '../core/subdomains.js';
import { updateTargetDashboard } from '../core/dashboard.js';
import { beginAbortable, endAbortable } from '../core/abort.js';
import { createStaticServer } from '../verifier.js';
import { getDefaultOutputDir } from './full-clone.js';
import { createCloneXSpinner, printSectionHeader } from '../ui/banner.js';
import { askUrl, selectFromMenu, askInput } from '../ui/prompt.js';

const RED = chalk.hex('#EF4444');
const GOLD = chalk.hex('#FBBF24');
const ARC = chalk.hex('#00E5FF');
const DIM = chalk.hex('#52525B');

export const siteMirrorModule = {
  id: 'site-mirror',
  category: 'Capture',
  title: 'Full Website & Subdomain Mirror',
  description: 'Multi-Page 1:1 Clone + Subdomains + Offline Link Rewriting + Docs',

  async run(context) {
    printSectionHeader('Full Website & Subdomain Mirror');

    const targetUrl = await askUrl('TARGET URL');
    if (!targetUrl) return;

    console.log('');
    const presets = [
      {
        id: 'standard',
        title: 'Standard Full-Site Mirror (Up to 20 Pages)',
        description: 'Crawl internal routes + 1:1 clone each page + rewrite offline links',
        maxPages: 20,
        maxDepth: 3,
        includeSubdomains: false
      },
      {
        id: 'deep',
        title: 'Deep Website Mirror (Up to 60 Pages + Documents)',
        description: 'Deep spider + 1:1 clone + download all PDFs/docs/archives',
        maxPages: 60,
        maxDepth: 5,
        includeSubdomains: false
      },
      {
        id: 'ecosystem',
        title: 'Total Ecosystem Mirror (Main Site + Live Subdomains)',
        description: 'Enumerate subdomains first, then mirror pages across all live hosts',
        maxPages: 40,
        maxDepth: 3,
        includeSubdomains: true
      },
      {
        id: 'custom',
        title: 'Custom Parameters',
        description: 'Specify exact page limit, depth & subdomain scope'
      }
    ];

    const chosen = await selectFromMenu('MIRROR PROFILE', presets, { allowBack: true });
    if (!chosen) return;

    let maxPages = chosen.maxPages || 20;
    let maxDepth = chosen.maxDepth || 3;
    let includeSubdomains = Boolean(chosen.includeSubdomains);

    if (chosen.id === 'custom') {
      const pInput = await askInput('MAX PAGES TO CLONE', '25');
      const dInput = await askInput('MAX CRAWL DEPTH', '4');
      const sInput = await askInput('INCLUDE SUBDOMAINS (y/n)', 'y');
      maxPages = Math.max(1, parseInt(pInput, 10) || 25);
      maxDepth = Math.max(1, parseInt(dInput, 10) || 4);
      includeSubdomains = sInput.toLowerCase().startsWith('y');
    }

    const baseOut = getDefaultOutputDir(process.cwd(), targetUrl);
    const outputDir = path.join(baseOut, '06-site-mirror');

    console.log('');
    console.log(`  ${DIM('TARGET      //')} ${ARC(targetUrl)}`);
    console.log(`  ${DIM('SCOPE       //')} ${chalk.white(`Max ${maxPages} pages (Depth ${maxDepth}) | Subdomains: ${includeSubdomains ? 'YES' : 'NO'}`)}`);
    console.log(`  ${DIM('MIRROR DIR  //')} ${chalk.white(outputDir)}\n`);

    const token = beginAbortable();
    const spinner = createCloneXSpinner('ENGAGING FULL-SITE MIRROR').start();
    const startTime = Date.now();

    try {
      let extraHosts = [];
      if (includeSubdomains) {
        const host = new URL(targetUrl).hostname;
        const subRes = await discoverSubdomains(host, {
          useCertificates: true,
          usePassiveApis: true,
          useBruteforce: false,
          useArchive: true,
          probe: true,
          onProgress: (msg) => spinner.update(msg),
          shouldStop: () => token.aborted
        });
        extraHosts = subRes.subdomains.filter((s) => s.alive).map((s) => s.host);
      }

      const result = await mirrorFullWebsite(targetUrl, {
        outputDir,
        maxPages,
        maxDepth,
        includeSubdomains,
        extraHosts,
        viewportWidth: context.settings.viewportWidth,
        viewportHeight: context.settings.viewportHeight,
        waitExtraMs: context.settings.waitExtraMs,
        fullScroll: context.settings.fullScroll,
        generateReactForRoot: true,
        downloadDocuments: true,
        token,
        onProgress: (msg) => spinner.update(msg)
      });

      await updateTargetDashboard(baseOut);
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const okCount = result.clonedPages.filter((p) => !p.error).length;
      spinner.succeed(`SITE MIRROR COMPLETE: ${okCount}/${result.clonedPages.length} PAGES CLONED [${elapsedSec}s]`);

      console.log(`\n  ${RED.bold('▸ MIRROR ARTIFACTS')}`);
      console.log(`   ${ARC('◈')} ${GOLD('HUD DASHBOARD ')} ${ARC.bold(path.join(baseOut, 'DASHBOARD.html'))}`);
      console.log(`   ${ARC('◈')} ${GOLD('MASTER INDEX  ')} ${chalk.white(result.dashboardPath)}`);
      console.log(`   ${ARC('◈')} ${GOLD('ROOT CLONE    ')} ${chalk.white(path.join(outputDir, 'index.html'))}`);
      console.log(`   ${ARC('◈')} ${GOLD('REACT BUILD   ')} ${chalk.white(path.join(outputDir, '02-react-project'))}`);
      console.log(`   ${ARC('◈')} ${GOLD('PAGES CLONED  ')} ${ARC.bold(okCount)} pages with offline link navigation`);
      if (result.downloadedDocs > 0) {
        console.log(`   ${ARC('◈')} ${GOLD('DOCUMENTS     ')} ${chalk.white(`${result.downloadedDocs} files in ${path.join(outputDir, 'documents')}`)}`);
      }
      console.log('');

      const postActions = [
        {
          id: 'preview-index',
          title: 'Launch Local Mirror Server (Open Master Index)',
          description: `http://localhost:${context.settings.previewPort || 4000}/SITE-INDEX.html`
        },
        {
          id: 'preview-root',
          title: 'Launch Local Mirror Server (Open Root Clone)',
          description: `http://localhost:${context.settings.previewPort || 4000}/index.html`
        },
        {
          id: 'explorer',
          title: 'Open Mirror Directory',
          description: outputDir
        }
      ];

      const nextAction = await selectFromMenu('POST-MIRROR OPERATIONS', postActions, {
        allowBack: true
      });

      if (!nextAction) return;

      if (nextAction.id === 'explorer') {
        if (process.platform === 'win32') {
          spawn('explorer.exe', [outputDir], { detached: true, stdio: 'ignore' }).unref();
        }
      } else if (nextAction.id === 'preview-index' || nextAction.id === 'preview-root') {
        const port = context.settings.previewPort || 4000;
        const server = createStaticServer(outputDir);
        await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
        const suffix = nextAction.id === 'preview-index' ? '/SITE-INDEX.html' : '/index.html';
        const previewUrl = `http://localhost:${port}${suffix}`;
        console.log(
          `\n  ${chalk.bgHex('#B91C1C').hex('#FBBF24').bold(' ONLINE ')} ${ARC(previewUrl)}`
        );
        if (process.platform === 'win32') {
          spawn('cmd.exe', ['/c', 'start', previewUrl], { detached: true, stdio: 'ignore' }).unref();
        }
        await askInput('ENTER to terminate server');
        server.close();
      }
    } catch (err) {
      spinner.fail(`MIRROR ABORTED: ${err.message}`);
      await askInput('ENTER to return');
    } finally {
      endAbortable();
    }
  }
};
