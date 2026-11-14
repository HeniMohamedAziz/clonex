import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { discoverSubdomains } from '../core/subdomains.js';
import { toCsv } from '../core/report.js';
import { beginAbortable, endAbortable } from '../core/abort.js';
import { getDefaultOutputDir, executeCloneJob } from './full-clone.js';
import { createCloneXSpinner, printSectionHeader } from '../ui/banner.js';
import { askUrl, selectFromMenu, pauseForEnter } from '../ui/prompt.js';

const RED = chalk.hex('#EF4444');
const GOLD = chalk.hex('#FBBF24');
const ARC = chalk.hex('#00E5FF');
const DIM = chalk.hex('#52525B');

export const subdomainHunterModule = {
  id: 'subdomain-hunter',
  category: 'Intelligence & Extraction',
  title: 'Subdomain & Archive Hunter',
  description: 'CT Logs (crt.sh) + DNS Brute-Force + Wayback CDX + Live Host Probe',

  async run(context) {
    printSectionHeader('Subdomain & Archive Hunter');

    const targetUrl = await askUrl('TARGET DOMAIN OR URL');
    if (!targetUrl) return;

    const host = new URL(targetUrl).hostname;
    const baseOut = getDefaultOutputDir(process.cwd(), targetUrl);
    const outDir = path.join(baseOut, 'subdomains');
    await fs.mkdir(outDir, { recursive: true });

    console.log('');
    const token = beginAbortable();
    const spinner = createCloneXSpinner(`HUNTING SUBDOMAINS FOR ${host.toUpperCase()}`).start();

    let result;
    try {
      result = await discoverSubdomains(host, {
        useCertificates: true,
        usePassiveApis: true,
        useBruteforce: true,
        useArchive: true,
        probe: true,
        onProgress: (msg) => spinner.update(msg),
        shouldStop: () => token.aborted
      });

      const jsonPath = path.join(outDir, 'subdomains.json');
      const csvPath = path.join(outDir, 'subdomains.csv');
      const archivePath = path.join(outDir, 'wayback-urls.txt');

      await fs.writeFile(jsonPath, JSON.stringify(result, null, 2), 'utf-8');
      await fs.writeFile(
        csvPath,
        toCsv(
          ['host', 'alive', 'status', 'url', 'title', 'ips', 'server', 'redirect', 'sources'],
          result.subdomains.map((s) => [
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
        ),
        'utf-8'
      );
      if (result.archivedUrls.length > 0) {
        await fs.writeFile(
          archivePath,
          result.archivedUrls.map((a) => `${a.status || '-'}\t${a.mime || '-'}\t${a.url}`).join('\n'),
          'utf-8'
        );
      }

      const alive = result.subdomains.filter((s) => s.alive);
      spinner.succeed(
        `SUBDOMAIN HUNT COMPLETE: ${result.subdomains.length} FOUND (${alive.length} LIVE) // ${result.archivedUrls.length} ARCHIVED URLS`
      );

      console.log(`\n  ${RED.bold(`▸ DISCOVERED SUBDOMAINS [${result.subdomains.length}]`)}`);
      result.subdomains.forEach((s, idx) => {
        const statusTag = s.alive ? ARC(`[${s.status}]`.padEnd(6, ' ')) : DIM('[DEAD]');
        const ips = (s.ips || []).slice(0, 2).join(', ');
        const src = (s.sources || []).join('+');
        console.log(
          `   ${GOLD(`[${idx + 1}]`)} ${statusTag} ${chalk.white.bold(s.host.padEnd(32, ' '))} ${DIM(ips.padEnd(16, ' '))} ${GOLD((s.title || '').slice(0, 32))} ${DIM(`[${src}]`)}`
        );
      });

      console.log(`\n  ${RED.bold('▸ ARTIFACTS')}`);
      console.log(`   ${ARC('◈')} ${GOLD('CSV   ')} ${chalk.white(csvPath)}`);
      console.log(`   ${ARC('◈')} ${GOLD('JSON  ')} ${chalk.white(jsonPath)}`);
      if (result.archivedUrls.length > 0) {
        console.log(`   ${ARC('◈')} ${GOLD('CDX   ')} ${chalk.white(archivePath)} ${DIM(`(${result.archivedUrls.length} Wayback URLs)`)}`);
      }
      console.log('');

      const aliveSubs = result.subdomains.filter((s) => s.alive && s.url);
      if (aliveSubs.length > 0) {
        const choices = [
          {
            id: '__clone_all__',
            title: `Batch 1:1 Clone All Live Subdomains (${aliveSubs.length})`,
            description: 'Capture 1:1 HTML/CSS + React for every live subdomain'
          },
          {
            id: '__open_dir__',
            title: 'Open Subdomains Report Folder',
            description: outDir
          },
          ...aliveSubs.slice(0, 25).map((s) => ({
            id: s.url,
            title: `Clone ${s.host}`,
            description: `${s.url} — ${s.title || ''}`
          }))
        ];

        const next = await selectFromMenu('SUBDOMAIN OPERATIONS', choices, { allowBack: true });
        if (next) {
          if (next.id === '__open_dir__') {
            if (process.platform === 'win32') {
              spawn('explorer.exe', [outDir], { detached: true, stdio: 'ignore' }).unref();
            }
          } else if (next.id === '__clone_all__') {
            for (const s of aliveSubs) {
              const targetOut = getDefaultOutputDir(process.cwd(), s.url);
              await executeCloneJob(s.url, {
                outputDir: targetOut,
                viewportWidth: context.settings.viewportWidth,
                viewportHeight: context.settings.viewportHeight,
                waitExtraMs: context.settings.waitExtraMs,
                fullScroll: context.settings.fullScroll,
                downloadAssets: true,
                generateReact: true,
                verify: false
              }).catch(() => {});
            }
            await pauseForEnter();
          } else {
            const targetOut = getDefaultOutputDir(process.cwd(), next.id);
            await executeCloneJob(next.id, {
              outputDir: targetOut,
              viewportWidth: context.settings.viewportWidth,
              viewportHeight: context.settings.viewportHeight,
              waitExtraMs: context.settings.waitExtraMs,
              fullScroll: context.settings.fullScroll,
              downloadAssets: true,
              generateReact: true,
              verify: true
            }).catch(() => {});
            await pauseForEnter();
          }
        }
      } else {
        await pauseForEnter();
      }
    } catch (err) {
      spinner.fail(`SUBDOMAIN HUNT ABORTED: ${err.message}`);
      await pauseForEnter();
    } finally {
      endAbortable();
    }
  }
};
