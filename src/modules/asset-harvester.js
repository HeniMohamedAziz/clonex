import path from 'path';
import fs from 'fs/promises';
import * as cheerio from 'cheerio';
import chalk from 'chalk';
import { captureWebpage } from '../capturer.js';
import { downloadAndRewriteAssets } from '../asset-downloader.js';
import { getDefaultOutputDir } from './full-clone.js';
import { createCloneXSpinner, printSectionHeader } from '../ui/banner.js';
import { askUrl, pauseForEnter } from '../ui/prompt.js';

const RED = chalk.hex('#EF4444');
const GOLD = chalk.hex('#FBBF24');
const ARC = chalk.hex('#00E5FF');

export const assetHarvesterModule = {
  id: 'asset-harvester',
  category: 'Intelligence & Extraction',
  title: 'Asset Harvester',
  description: 'Images + Inline SVGs + Web Fonts',

  async run(context) {
    printSectionHeader('Asset Harvester');

    const targetUrl = await askUrl('TARGET URL');
    if (!targetUrl) return;

    const outputDir = getDefaultOutputDir(process.cwd(), targetUrl);
    const svgDir = path.join(outputDir, 'assets', 'svgs');
    await fs.mkdir(svgDir, { recursive: true });

    console.log('');
    const spinner = createCloneXSpinner('SCANNING MEDIA & VECTORS').start();

    try {
      const captureData = await captureWebpage(targetUrl, {
        viewportWidth: context.settings.viewportWidth,
        viewportHeight: context.settings.viewportHeight,
        waitExtraMs: context.settings.waitExtraMs,
        fullScroll: true,
        onProgress: (msg) => spinner.update(msg.toUpperCase())
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

      spinner.update('DOWNLOADING REMOTE ASSETS & FONTS');
      const assetResult = await downloadAndRewriteAssets({
        cssText: captureData.fullCss,
        $,
        baseUrl: captureData.finalUrl,
        outputDir,
        networkCache: captureData.networkCache,
        userAgent: captureData.userAgent
      });

      spinner.succeed('ASSET HARVEST COMPLETE');

      console.log(`\n  ${RED.bold('▸ SUMMARY')}`);
      console.log(
        `   ${ARC('◈')} ${GOLD('MEDIA & FONTS ')} ${chalk.white(assetResult.downloadedCount)}`
      );
      console.log(
        `   ${ARC('◈')} ${GOLD('INLINE SVGS   ')} ${chalk.white(inlineSvgCount)}`
      );
      console.log(
        `   ${ARC('◈')} ${GOLD('DIRECTORY     ')} ${chalk.white(path.join(outputDir, 'assets'))}`
      );
    } catch (err) {
      spinner.fail(`ABORTED: ${err.message}`);
    }

    await pauseForEnter();
  }
};
