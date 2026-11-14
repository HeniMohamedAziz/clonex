import path from 'path';
import fs from 'fs/promises';
import chalk from 'chalk';
import { launchBrowser } from '../browser-finder.js';
import { getDefaultOutputDir } from './full-clone.js';
import { createCloneXSpinner, printSectionHeader } from '../ui/banner.js';
import { askUrl, pauseForEnter } from '../ui/prompt.js';

const RED = chalk.hex('#EF4444');
const GOLD = chalk.hex('#FBBF24');
const ARC = chalk.hex('#00E5FF');
const DIM = chalk.hex('#52525B');

const VIEWPORTS = [
  { name: 'desktop-1440x900', label: 'DESKTOP 1440x900', width: 1440, height: 900 },
  { name: 'tablet-768x1024', label: 'TABLET  768x1024', width: 768, height: 1024 },
  { name: 'mobile-390x844', label: 'MOBILE  390x844', width: 390, height: 844 }
];

export const snapshotsModule = {
  id: 'snapshots',
  category: 'Capture',
  title: 'Multi-Viewport Snapshots',
  description: 'Desktop / Tablet / Mobile @2x Retina',

  async run() {
    printSectionHeader('Multi-Viewport Snapshots');

    const targetUrl = await askUrl('TARGET URL');
    if (!targetUrl) return;

    const outputDir = path.join(getDefaultOutputDir(process.cwd(), targetUrl), 'snapshots');
    await fs.mkdir(outputDir, { recursive: true });

    console.log('');
    const spinner = createCloneXSpinner('INITIALIZING OPTICS').start();
    const browser = await launchBrowser(['--font-render-hinting=none']);

    try {
      const savedFiles = [];

      for (const vp of VIEWPORTS) {
        spinner.update(`CAPTURING ${vp.label}`);
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 2,
          ignoreHTTPSErrors: true
        });
        const page = await context.newPage();
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
        await page.evaluate(() => document.fonts?.ready).catch(() => {});
        await page.waitForTimeout(800);

        const viewportFile = path.join(outputDir, `${vp.name}.png`);
        const fullPageFile = path.join(outputDir, `${vp.name}-full.png`);

        await page.screenshot({ path: viewportFile, fullPage: false });
        await page.screenshot({ path: fullPageFile, fullPage: true });

        savedFiles.push({ label: vp.label, viewportFile, fullPageFile });
        await context.close();
      }

      spinner.succeed('VIEWPORT CAPTURE COMPLETE');
      console.log(`\n  ${RED.bold('▸ OUTPUT')}`);
      for (const item of savedFiles) {
        console.log(`   ${ARC('◈')} ${GOLD(item.label.padEnd(18, ' '))} ${chalk.white(item.viewportFile)}`);
        console.log(`     ${DIM('FULL              ')} ${chalk.white(item.fullPageFile)}`);
      }
    } catch (err) {
      spinner.fail(`ABORTED: ${err.message}`);
    } finally {
      await browser.close();
    }

    await pauseForEnter();
  }
};
