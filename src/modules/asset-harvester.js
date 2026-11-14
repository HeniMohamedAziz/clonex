import path from 'path';
import fs from 'fs/promises';
import * as cheerio from 'cheerio';
import chalk from 'chalk';
import { captureWebpage } from '../capturer.js';
import { downloadAndRewriteAssets } from '../asset-downloader.js';
import { getDefaultOutputDir } from './full-clone.js';
import { createCloneXSpinner, printSectionHeader } from '../ui/banner.js';
import { askUrl, pauseForEnter } from '../ui/prompt.js';

export const assetHarvesterModule = {
  id: 'asset-harvester',
  category: 'Extraction & Inspection',
  title: 'Asset Harvester (Images, SVGs & Fonts)',
  description: 'Download all high-res images, inline SVGs & web fonts from a URL',

  async run(context) {
    printSectionHeader(
      'Asset Harvester',
      'Scrape and organize all images, inline SVGs, and web fonts'
    );

    const targetUrl = await askUrl('Target URL (or 0 to go back)');
    if (!targetUrl) return;

    const outputDir = getDefaultOutputDir(process.cwd(), targetUrl);
    const svgDir = path.join(outputDir, 'assets', 'svgs');
    await fs.mkdir(svgDir, { recursive: true });

    console.log('');
    const spinner = createCloneXSpinner('Scanning page for media, SVGs, and font files...').start();

    try {
      const captureData = await captureWebpage(targetUrl, {
        viewportWidth: context.settings.viewportWidth,
        viewportHeight: context.settings.viewportHeight,
        waitExtraMs: context.settings.waitExtraMs,
        fullScroll: true,
        onProgress: (msg) => spinner.update(msg)
      });

      const $ = cheerio.load(`<body>${captureData.bodyHtml}</body>`, {
        decodeEntities: false
      });

      let inlineSvgCount = 0;
      const svgNodes = $('svg').toArray();
      for (let i = 0; i < svgNodes.length; i++) {
        const $svg = $(svgNodes[i]);
        if (!$svg.attr('xmlns')) {
          $svg.attr('xmlns', 'http://www.w3.org/2000/svg');
        }
        const rawSvg = $.html(svgNodes[i]);
        if (rawSvg && rawSvg.length > 40) {
          inlineSvgCount++;
          await fs.writeFile(
            path.join(svgDir, `icon-${inlineSvgCount}.svg`),
            rawSvg,
            'utf-8'
          );
        }
      }

      spinner.update('Downloading external images and web fonts...');
      const assetResult = await downloadAndRewriteAssets({
        cssText: captureData.fullCss,
        $,
        baseUrl: captureData.finalUrl,
        outputDir,
        networkCache: captureData.networkCache,
        userAgent: captureData.userAgent
      });

      spinner.succeed('Asset harvesting complete!');

      console.log(`\n  ${chalk.hex('#00F5D4').bold('Harvest Summary:')}`);
      console.log(
        `   ${chalk.green('•')} ${chalk.white.bold('Downloaded Media & Fonts :')} ${chalk.white(assetResult.downloadedCount)} files`
      );
      console.log(
        `   ${chalk.green('•')} ${chalk.white.bold('Extracted Inline SVGs    :')} ${chalk.white(inlineSvgCount)} vector files`
      );
      console.log(
        `   ${chalk.green('•')} ${chalk.white.bold('Output Directory         :')} ${chalk.cyan(path.join(outputDir, 'assets'))}`
      );
    } catch (err) {
      spinner.fail(`Asset harvest failed: ${err.message}`);
    }

    await pauseForEnter();
  }
};
