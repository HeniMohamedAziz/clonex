import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { createStaticServer } from './verifier.js';
import {
  clearScreen,
  renderBanner,
  playBootAnimation
} from './ui/banner.js';
import { selectFromMenu, closePrompt } from './ui/prompt.js';
import { CLONEX_MODULES } from './modules/index.js';
import { executeCloneJob, getDefaultOutputDir } from './modules/full-clone.js';

const RED = chalk.hex('#EF4444');
const GOLD = chalk.hex('#FBBF24');
const ARC = chalk.hex('#00E5FF');

const runtimeContext = {
  settings: {
    viewportWidth: 1440,
    viewportHeight: 900,
    waitExtraMs: 1500,
    fullScroll: true,
    previewPort: 4000
  }
};

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

function normalizeUrl(rawUrl) {
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
    .description('CloneX — Web Capture & Recon Suite')
    .version('1.1.0');

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
        targetUrl = normalizeUrl(rawUrl);
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
