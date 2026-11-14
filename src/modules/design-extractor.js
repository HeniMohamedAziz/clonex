import path from 'path';
import fs from 'fs/promises';
import chalk from 'chalk';
import { captureWebpage } from '../capturer.js';
import { generatePalettePreviewHtml, updateTargetDashboard } from '../core/dashboard.js';
import { getDefaultOutputDir } from './full-clone.js';
import { createCloneXSpinner, printSectionHeader } from '../ui/banner.js';
import { askUrl, pauseForEnter } from '../ui/prompt.js';

const RED = chalk.hex('#EF4444');
const GOLD = chalk.hex('#FBBF24');
const ARC = chalk.hex('#00E5FF');
const DIM = chalk.hex('#52525B');

function rgbStringToHex(rgbStr) {
  const match = rgbStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!match) return null;
  const r = Math.min(255, parseInt(match[1], 10));
  const g = Math.min(255, parseInt(match[2], 10));
  const b = Math.min(255, parseInt(match[3], 10));
  return (
    '#' +
    [r, g, b]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export const designExtractorModule = {
  id: 'design-extractor',
  category: 'Intelligence & Extraction',
  title: 'Design System & Tokens',
  description: 'Palette + Typography + CSS Variables + Tailwind Config',

  async run(context) {
    printSectionHeader('Design System & Tokens');

    const targetUrl = await askUrl('TARGET URL');
    if (!targetUrl) return;

    const outputDir = getDefaultOutputDir(process.cwd(), targetUrl);
    const designDir = path.join(outputDir, '03-design-system');
    await fs.mkdir(designDir, { recursive: true });

    console.log('');
    const spinner = createCloneXSpinner('SCANNING COMPUTED STYLES').start();

    try {
      const captureData = await captureWebpage(targetUrl, {
        viewportWidth: context.settings.viewportWidth,
        viewportHeight: context.settings.viewportHeight,
        waitExtraMs: 1000,
        fullScroll: false,
        onProgress: (msg) => spinner.update(msg.toUpperCase())
      });

      const tokens = captureData.designTokens;
      const tokensPath = path.join(designDir, 'design-tokens.json');
      await fs.writeFile(tokensPath, JSON.stringify(tokens, null, 2), 'utf-8');

      const palette = {};
      (tokens.colors || []).slice(0, 12).forEach((c, idx) => {
        const hex = rgbStringToHex(c.color) || c.color;
        palette[`brand-${idx + 1}`] = hex;
      });

      const tailwindConfig = `export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: ${JSON.stringify(palette, null, 8)},
      fontFamily: {
        primary: ${JSON.stringify(tokens.fontFamilies.slice(0, 3))}
      },
      borderRadius: ${JSON.stringify(
        Object.fromEntries(tokens.borderRadii.slice(0, 6).map((r, i) => [`token-${i + 1}`, r])),
        null,
        8
      )}
    }
  },
  plugins: []
};
`;
      const twPath = path.join(designDir, 'tailwind.config.js');
      await fs.writeFile(twPath, tailwindConfig, 'utf-8');
      const previewPath = path.join(designDir, 'palette-preview.html');
      await generatePalettePreviewHtml(tokens, previewPath);
      await updateTargetDashboard(outputDir);

      spinner.succeed(`TOKENS EXTRACTED: "${captureData.title}"`);

      console.log(`\n  ${RED.bold('▸ PALETTE')}`);
      (tokens.colors || []).slice(0, 8).forEach((item) => {
        const hex = rgbStringToHex(item.color);
        const swatch = hex ? chalk.bgHex(hex)('    ') : '    ';
        console.log(
          `   ${swatch}  ${GOLD.bold((hex || item.color).padEnd(12, ' '))} ${DIM(`${item.color} [${item.count}]`)}`
        );
      });

      console.log(`\n  ${RED.bold('▸ TYPOGRAPHY')}`);
      console.log(`   ${chalk.white(tokens.fontFamilies.join(' // ') || 'Default')}`);

      console.log(`\n  ${RED.bold('▸ ARTIFACTS')}`);
      console.log(`   ${ARC('◈')} ${chalk.white(tokensPath)}`);
      console.log(`   ${ARC('◈')} ${chalk.white(twPath)}`);
      console.log(`   ${ARC('◈')} ${chalk.white(previewPath)}`);
    } catch (err) {
      spinner.fail(`ABORTED: ${err.message}`);
    }

    await pauseForEnter();
  }
};
