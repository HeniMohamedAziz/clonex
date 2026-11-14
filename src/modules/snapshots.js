import path from 'path';
import fs from 'fs/promises';
import chalk from 'chalk';
import { launchBrowser } from '../browser-finder.js';
import { getDefaultOutputDir } from './full-clone.js';
import { createCloneXSpinner, printSectionHeader } from '../ui/banner.js';
import { askUrl, pauseForEnter } from '../ui/prompt.js';

const VIEWPORTS = [
  { name: 'desktop-1440x900', label: 'Desktop (1440x900)', width: 1440, height: 900 },
  { name: 'tablet-768x1024', label: 'Tablet (768x1024)', width: 768, height: 1024 },
  { name: 'mobile-390x844', label: 'Mobile (390x844)', width: 390, height: 844 }
];

export const snapshotsModule = {
  id: 'snapshots',
  category: 'Capture & Cloning',
  title: 'Multi-Viewport Responsive Snapshots',
  description: 'Capture Desktop, Tablet & Mobile @2x Retina screenshots',

  async run() {
    printSectionHeader(
      'Multi-Viewport Snapshots',
      'Capture Desktop, Tablet, and Mobile retina screenshots'
    );

    const targetUrl = await askUrl('Target URL (or 0 to go back)');
    if (!targetUrl) return;

    const outputDir = path.join(getDefaultOutputDir(process.cwd(), targetUrl), 'snapshots');
    await fs.mkdir(outputDir, { recursive: true });

    console.log('');
    const spinner = createCloneXSpinner('Launching browser for multi-viewport capture...').start();
    const browser = await launchBrowser(['--font-render-hinting=none']);

    try {
      const savedFiles = [];

      for (const vp of VIEWPORTS) {
        spinner.update(`Capturing ${vp.label}...`);
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

      spinner.succeed('Captured all responsive viewports!');
      console.log(`\n  ${chalk.hex('#00F5D4').bold('Saved Screenshots:')}`);
      for (const item of savedFiles) {
        console.log(`   ${chalk.green('•')} ${chalk.white.bold(item.label.padEnd(20, ' '))} : ${chalk.cyan(item.viewportFile)}`);
        console.log(`     ${chalk.gray('Full Page            :')} ${chalk.cyan(item.fullPageFile)}`);
      }
    } catch (err) {
      spinner.fail(`Snapshot failed: ${err.message}`);
    } finally {
      await browser.close();
    }

    await pauseForEnter();
  }
};
