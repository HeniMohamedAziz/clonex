#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { createStaticServer } from '../src/verifier.js';
import {
  clearScreen,
  renderBanner,
  playBootAnimation
} from '../src/ui/banner.js';
import { selectFromMenu, closePrompt } from '../src/ui/prompt.js';
import { CLONEX_MODULES } from '../src/modules/index.js';
import { executeCloneJob, getDefaultOutputDir } from '../src/modules/full-clone.js';

const runtimeContext = {
  settings: {
    viewportWidth: 1440,
    viewportHeight: 900,
    waitExtraMs: 1500,
    fullScroll: true,
    previewPort: 4000
  }
};

async function startInteractiveMenu() {
  await playBootAnimation();

  while (true) {
    clearScreen();
    renderBanner();

    const selectedModule = await selectFromMenu(
      'MAIN MENU — Choose a tool by number:',
      CLONEX_MODULES
    );

    if (!selectedModule) {
      console.log(`\n  ${chalk.hex('#00F5D4')('Shutting down CloneX. Goodbye!')}\n`);
      closePrompt();
      process.exit(0);
    }

    clearScreen();
    renderBanner(`${selectedModule.title}`);
    await selectedModule.run(runtimeContext);
  }
}

function normalizeUrl(rawUrl) {
  let trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  return new URL(trimmed).href;
}

const program = new Command();

program
  .name('clonex')
  .description('CloneX — Interactive Web Design Capture & Reverse-Engineering Suite')
  .version('1.1.0');

program
  .argument('[url]', 'Optional URL to clone directly (omit to launch interactive menu)')
  .option('-o, --output <dir>', 'Custom output directory path')
  .option('-W, --width <number>', 'Viewport width in pixels', '1440')
  .option('-H, --height <number>', 'Viewport height in pixels', '900')
  .option('--wait <ms>', 'Extra wait time in ms after scrolling', '1500')
  .option('--no-scroll', 'Disable full-page auto-scroll before capture')
  .option('--no-assets', 'Keep remote asset URLs instead of downloading locally')
  .option('--no-react', 'Skip generating the React + Tailwind project')
  .option('--no-verify', 'Skip screenshot comparison verification')
  .option('-s, --serve', 'Start a local preview server after cloning')
  .option('-p, --port <number>', 'Port for preview server', '4000')
  .action(async (rawUrl, options) => {
    if (!rawUrl) {
      await startInteractiveMenu();
      return;
    }

    renderBanner();

    let targetUrl;
    try {
      targetUrl = normalizeUrl(rawUrl);
    } catch {
      console.error(chalk.red(`  ✖ Invalid URL: "${rawUrl}"`));
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
            `  ${chalk.bgHex('#00F5D4').black.bold(' LIVE ')} Preview server running at ${chalk.cyan(`http://localhost:${port}`)}`
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
  .command('preview <dir>')
  .description('Start a local static server to preview a cloned folder')
  .option('-p, --port <number>', 'Port to listen on', '4000')
  .action((dir, opts) => {
    renderBanner('Local Preview Server');
    const resolvedDir = path.resolve(process.cwd(), dir);
    const port = parseInt(opts.port, 10) || 4000;
    const server = createStaticServer(resolvedDir);
    server.listen(port, '127.0.0.1', () => {
      console.log(
        `  ${chalk.bgHex('#00F5D4').black.bold(' LIVE ')} Serving ${chalk.white(resolvedDir)} at ${chalk.cyan.underline(`http://localhost:${port}`)}\n`
      );
    });
  });

program.parse(process.argv);
