import path from 'path';
import fs from 'fs/promises';
import chalk from 'chalk';
import { captureWebpage } from '../capturer.js';
import { getDefaultOutputDir } from './full-clone.js';
import { createCloneXSpinner, printSectionHeader } from '../ui/banner.js';
import { askUrl, pauseForEnter } from '../ui/prompt.js';

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
  category: 'Extraction & Inspection',
  title: 'Design System & Tailwind Extractor',
  description: 'Extract color palette, fonts, CSS variables & tailwind.config.js',

  async run(context) {
    printSectionHeader(
      'Design System Extractor',
      'Extract colors, typography, CSS variables & Tailwind config'
    );

    const targetUrl = await askUrl('Target URL (or 0 to go back)');
    if (!targetUrl) return;

    const outputDir = getDefaultOutputDir(process.cwd(), targetUrl);
    await fs.mkdir(outputDir, { recursive: true });

    console.log('');
    const spinner = createCloneXSpinner('Scanning computed styles and CSS variables...').start();

    try {
      const captureData = await captureWebpage(targetUrl, {
        viewportWidth: context.settings.viewportWidth,
        viewportHeight: context.settings.viewportHeight,
        waitExtraMs: 1000,
        fullScroll: false,
        onProgress: (msg) => spinner.update(msg)
      });

      const tokens = captureData.designTokens;
      const tokensPath = path.join(outputDir, 'design-tokens.json');
      await fs.writeFile(tokensPath, JSON.stringify(tokens, null, 2), 'utf-8');

      const palette = {};
      (tokens.colors || []).slice(0, 12).forEach((c, idx) => {
        const hex = rgbStringToHex(c.color) || c.color;
        palette[`brand-${idx + 1}`] = hex;
      });

      const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
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
      const twPath = path.join(outputDir, 'tailwind.config.js');
      await fs.writeFile(twPath, tailwindConfig, 'utf-8');

      spinner.succeed(`Extracted design tokens from "${captureData.title}"`);

      console.log(`\n  ${chalk.hex('#00F5D4').bold('Top Colors Detected:')}`);
      (tokens.colors || []).slice(0, 8).forEach((item) => {
        const hex = rgbStringToHex(item.color);
        const swatch = hex ? chalk.bgHex(hex)('    ') : '    ';
        console.log(
          `   ${swatch}  ${chalk.white.bold((hex || item.color).padEnd(12, ' '))} ${chalk.gray(`(${item.color} — ${item.count} nodes)`)}`
        );
      });

      console.log(`\n  ${chalk.hex('#00F5D4').bold('Font Families:')}`);
      console.log(`   ${chalk.white(tokens.fontFamilies.join(', ') || 'System Default')}`);

      console.log(`\n  ${chalk.hex('#00F5D4').bold('Saved Files:')}`);
      console.log(`   ${chalk.green('•')} ${chalk.cyan(tokensPath)}`);
      console.log(`   ${chalk.green('•')} ${chalk.cyan(twPath)}`);
    } catch (err) {
      spinner.fail(`Extraction failed: ${err.message}`);
    }

    await pauseForEnter();
  }
};
