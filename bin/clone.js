#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs/promises';
import { captureWebpage } from '../src/capturer.js';
import { generateHtmlOutput } from '../src/generators/html-generator.js';
import { generateReactProject } from '../src/generators/react-generator.js';
import { verifyCloneFidelity, createStaticServer } from '../src/verifier.js';

const program = new Command();

function normalizeUrl(rawUrl) {
  let trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  return new URL(trimmed).href;
}

function getDefaultOutputDir(targetUrl) {
  const parsed = new URL(targetUrl);
  const cleanHost = parsed.hostname.replace(/^www\./, '').replace(/[^a-zA-Z0-9.-]/g, '_');
  const cleanPath = parsed.pathname
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const folderName = cleanPath ? `${cleanHost}_${cleanPath}` : cleanHost;
  return path.resolve(process.cwd(), 'cloned-sites', folderName);
}

program
  .name('clonex')
  .description('Capture live webpages and export clean HTML/CSS and React/Tailwind code.')
  .version('1.0.0');

program
  .argument('[url]', 'Target webpage URL to clone')
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
      program.help();
      return;
    }

    let targetUrl;
    try {
      targetUrl = normalizeUrl(rawUrl);
    } catch {
      console.error(chalk.red(`Invalid URL: "${rawUrl}"`));
      process.exit(1);
    }

    const viewportWidth = parseInt(options.width, 10) || 1440;
    const viewportHeight = parseInt(options.height, 10) || 900;
    const waitExtraMs = parseInt(options.wait, 10) || 1500;
    const outputDir = options.output
      ? path.resolve(process.cwd(), options.output)
      : getDefaultOutputDir(targetUrl);

    await fs.mkdir(outputDir, { recursive: true });
    const originalScreenshotPath = path.join(outputDir, 'screenshot-original.png');

    console.log(chalk.gray('\nTarget   : ') + chalk.cyan(targetUrl));
    console.log(chalk.gray('Viewport : ') + chalk.white(`${viewportWidth}x${viewportHeight}`));
    console.log(chalk.gray('Output   : ') + chalk.white(outputDir) + '\n');

    const spinner = ora({ text: 'Starting capture...', color: 'cyan' }).start();
    const startTime = Date.now();

    try {
      const captureData = await captureWebpage(targetUrl, {
        viewportWidth,
        viewportHeight,
        waitExtraMs,
        fullScroll: options.scroll,
        screenshotPath: originalScreenshotPath,
        onProgress: (msg) => {
          spinner.text = msg;
        }
      });

      const htmlResult = await generateHtmlOutput(captureData, outputDir, {
        downloadAssets: options.assets,
        onProgress: (msg) => {
          spinner.text = msg;
        }
      });

      let reactResult = null;
      if (options.react) {
        reactResult = await generateReactProject(
          htmlResult,
          captureData.designTokens,
          outputDir,
          {
            onProgress: (msg) => {
              spinner.text = msg;
            }
          }
        );
      }

      let verifyResult = null;
      if (options.verify) {
        verifyResult = await verifyCloneFidelity({
          outputDir,
          originalScreenshotPath,
          viewportWidth,
          viewportHeight,
          onProgress: (msg) => {
            spinner.text = msg;
          }
        });
      }

      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      spinner.succeed(chalk.green(`Cloned "${captureData.title}" in ${elapsedSec}s`));

      console.log('\nOutput files:');
      console.log(`  HTML/CSS      : ${chalk.cyan(path.join(outputDir, 'index.html'))}`);
      console.log(`  Stylesheet    : ${chalk.cyan(path.join(outputDir, 'styles.css'))}`);
      console.log(`  Single file   : ${chalk.cyan(path.join(outputDir, 'single-file.html'))}`);
      console.log(`  Design tokens : ${chalk.cyan(path.join(outputDir, 'design-tokens.json'))}`);

      if (options.assets) {
        console.log(
          `  Assets        : ${htmlResult.assetStats.downloadedCount} files in ${chalk.cyan(path.join(outputDir, 'assets'))}`
        );
      }

      if (reactResult) {
        console.log(
          `  React project : ${chalk.cyan(reactResult.reactDir)} (${reactResult.components.length} components)`
        );
      }

      if (verifyResult && verifyResult.similarityPercent !== null) {
        console.log(`  Visual match  : ${chalk.magenta(`${verifyResult.similarityPercent}%`)}`);
      }
      console.log('');

      if (options.serve) {
        const port = parseInt(options.port, 10) || 4000;
        const server = createStaticServer(outputDir);
        server.listen(port, '127.0.0.1', () => {
          console.log(`Preview server running at ${chalk.cyan(`http://localhost:${port}`)}`);
        });
      }
    } catch (err) {
      spinner.fail(chalk.red('Clone failed'));
      console.error(chalk.red(err.stack || err.message));
      process.exit(1);
    }
  });

program
  .command('preview <dir>')
  .description('Start a local static server to preview a cloned folder')
  .option('-p, --port <number>', 'Port to listen on', '4000')
  .action((dir, opts) => {
    const resolvedDir = path.resolve(process.cwd(), dir);
    const port = parseInt(opts.port, 10) || 4000;
    const server = createStaticServer(resolvedDir);
    server.listen(port, '127.0.0.1', () => {
      console.log(`Serving ${resolvedDir} at ${chalk.cyan(`http://localhost:${port}`)}`);
    });
  });

program.parse(process.argv);
