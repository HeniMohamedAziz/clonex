import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { captureWebpage } from '../capturer.js';
import { generateHtmlOutput } from '../generators/html-generator.js';
import { generateReactProject } from '../generators/react-generator.js';
import { verifyCloneFidelity, createStaticServer } from '../verifier.js';
import { createCloneXSpinner, printSectionHeader } from '../ui/banner.js';
import { askUrl, selectFromMenu, askInput } from '../ui/prompt.js';

export function getDefaultOutputDir(baseDir, targetUrl) {
  const parsed = new URL(targetUrl);
  const cleanHost = parsed.hostname.replace(/^www\./, '').replace(/[^a-zA-Z0-9.-]/g, '_');
  const cleanPath = parsed.pathname
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const folderName = cleanPath ? `${cleanHost}_${cleanPath}` : cleanHost;
  return path.resolve(baseDir, 'cloned-sites', folderName);
}

export async function executeCloneJob(targetUrl, jobOptions = {}) {
  const {
    outputDir = getDefaultOutputDir(process.cwd(), targetUrl),
    viewportWidth = 1440,
    viewportHeight = 900,
    waitExtraMs = 1500,
    fullScroll = true,
    downloadAssets = true,
    generateReact = true,
    verify = true
  } = jobOptions;

  await fs.mkdir(outputDir, { recursive: true });
  const originalScreenshotPath = path.join(outputDir, 'screenshot-original.png');

  console.log('');
  console.log(`  ${chalk.gray('Target URL :')} ${chalk.cyan.underline(targetUrl)}`);
  console.log(`  ${chalk.gray('Viewport   :')} ${chalk.white(`${viewportWidth}x${viewportHeight} (@2x Retina)`)}`);
  console.log(`  ${chalk.gray('Output Dir :')} ${chalk.white(outputDir)}\n`);

  const spinner = createCloneXSpinner('Initializing CloneX capture engine...').start();
  const startTime = Date.now();

  try {
    const captureData = await captureWebpage(targetUrl, {
      viewportWidth,
      viewportHeight,
      waitExtraMs,
      fullScroll,
      screenshotPath: originalScreenshotPath,
      onProgress: (msg) => spinner.update(msg)
    });

    const htmlResult = await generateHtmlOutput(captureData, outputDir, {
      downloadAssets,
      onProgress: (msg) => spinner.update(msg)
    });

    let reactResult = null;
    if (generateReact) {
      reactResult = await generateReactProject(
        htmlResult,
        captureData.designTokens,
        outputDir,
        {
          onProgress: (msg) => spinner.update(msg)
        }
      );
    }

    let verifyResult = null;
    if (verify) {
      verifyResult = await verifyCloneFidelity({
        outputDir,
        originalScreenshotPath,
        viewportWidth,
        viewportHeight,
        onProgress: (msg) => spinner.update(msg)
      });
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    spinner.succeed(`Cloned "${captureData.title}" in ${elapsedSec}s`);

    console.log('');
    console.log(`  ${chalk.hex('#00F5D4').bold('Generated Files:')}`);
    console.log(`   ${chalk.green('•')} ${chalk.white.bold('HTML / CSS    :')} ${chalk.cyan(path.join(outputDir, 'index.html'))}`);
    console.log(`   ${chalk.green('•')} ${chalk.white.bold('Stylesheet    :')} ${chalk.cyan(path.join(outputDir, 'styles.css'))}`);
    console.log(`   ${chalk.green('•')} ${chalk.white.bold('Single File   :')} ${chalk.cyan(path.join(outputDir, 'single-file.html'))}`);
    console.log(`   ${chalk.green('•')} ${chalk.white.bold('Design Tokens :')} ${chalk.cyan(path.join(outputDir, 'design-tokens.json'))}`);

    if (downloadAssets) {
      console.log(
        `   ${chalk.green('•')} ${chalk.white.bold('Local Assets  :')} ${chalk.white(`${htmlResult.assetStats.downloadedCount} files in`)} ${chalk.cyan(path.join(outputDir, 'assets'))}`
      );
    }

    if (reactResult) {
      console.log(
        `   ${chalk.green('•')} ${chalk.white.bold('React Project :')} ${chalk.cyan(reactResult.reactDir)} ${chalk.gray(`(${reactResult.components.length} components)`)}`
      );
    }

    if (verifyResult && verifyResult.similarityPercent !== null) {
      console.log(
        `   ${chalk.green('•')} ${chalk.white.bold('Visual Match  :')} ${chalk.hex('#00F5D4').bold(`${verifyResult.similarityPercent}% pixel fidelity`)}`
      );
    }
    console.log('');

    return { outputDir, captureData, htmlResult, reactResult, verifyResult };
  } catch (err) {
    spinner.fail(`Clone failed: ${err.message}`);
    throw err;
  }
}

export const fullCloneModule = {
  id: 'full-clone',
  category: 'Capture & Cloning',
  title: 'Clone Webpage (1:1 Design Capture)',
  description: 'Clone live DOM, CSS, assets & generate HTML/CSS + React code',

  async run(context) {
    printSectionHeader('1:1 Webpage Cloner', 'Enter target link and choose capture mode');

    const targetUrl = await askUrl('Target URL (or 0 to go back)');
    if (!targetUrl) return;

    console.log('');
    const presets = [
      {
        id: 'full',
        title: 'Full 1:1 Suite (Recommended)',
        description: 'HTML/CSS + React/Tailwind + Local Assets + Visual Verification',
        opts: {
          viewportWidth: context.settings.viewportWidth,
          viewportHeight: context.settings.viewportHeight,
          downloadAssets: true,
          generateReact: true,
          verify: true
        }
      },
      {
        id: 'html-only',
        title: 'Clean HTML + CSS + Assets Only',
        description: 'Skip React project generation for faster static output',
        opts: {
          viewportWidth: context.settings.viewportWidth,
          viewportHeight: context.settings.viewportHeight,
          downloadAssets: true,
          generateReact: false,
          verify: true
        }
      },
      {
        id: 'mobile',
        title: 'Mobile Viewport 1:1 Clone (390x844)',
        description: 'Capture mobile layout, responsive styles & React components',
        opts: {
          viewportWidth: 390,
          viewportHeight: 844,
          downloadAssets: true,
          generateReact: true,
          verify: true
        }
      },
      {
        id: 'fast',
        title: 'Quick Snapshot Clone (No Local Asset Download)',
        description: 'Keep remote CDN links for instant HTML/CSS & React export',
        opts: {
          viewportWidth: context.settings.viewportWidth,
          viewportHeight: context.settings.viewportHeight,
          downloadAssets: false,
          generateReact: true,
          verify: false
        }
      }
    ];

    const chosenPreset = await selectFromMenu('Select Clone Mode:', presets, {
      allowBack: true,
      backLabel: 'Cancel'
    });
    if (!chosenPreset) return;

    const outputDir = getDefaultOutputDir(process.cwd(), targetUrl);

    try {
      await executeCloneJob(targetUrl, {
        outputDir,
        waitExtraMs: context.settings.waitExtraMs,
        fullScroll: context.settings.fullScroll,
        ...chosenPreset.opts
      });

      const postActions = [
        {
          id: 'preview',
          title: 'Launch Local Preview Server',
          description: 'View the cloned webpage in your browser at http://localhost:4000'
        },
        {
          id: 'explorer',
          title: 'Open Output Folder in Explorer',
          description: outputDir
        }
      ];

      const nextAction = await selectFromMenu('What would you like to do next?', postActions, {
        allowBack: true,
        backLabel: 'Return to Main Menu'
      });

      if (!nextAction) return;

      if (nextAction.id === 'explorer') {
        if (process.platform === 'win32') {
          spawn('explorer.exe', [outputDir], { detached: true, stdio: 'ignore' }).unref();
        }
      } else if (nextAction.id === 'preview') {
        const port = context.settings.previewPort || 4000;
        const server = createStaticServer(outputDir);
        await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
        const previewUrl = `http://localhost:${port}`;
        console.log(
          `\n  ${chalk.bgHex('#00F5D4').black.bold(' LIVE ')} Preview running at ${chalk.cyan.underline(previewUrl)}`
        );
        if (process.platform === 'win32') {
          spawn('cmd.exe', ['/c', 'start', previewUrl], { detached: true, stdio: 'ignore' }).unref();
        }
        await askInput('Press Enter to stop the preview server and return to menu');
        server.close();
      }
    } catch {
      await askInput('Press Enter to return to menu');
    }
  }
};
