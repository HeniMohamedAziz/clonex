import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { captureWebpage } from '../capturer.js';
import { generateHtmlOutput } from '../generators/html-generator.js';
import { generateReactProject } from '../generators/react-generator.js';
import { verifyCloneFidelity, createStaticServer } from '../verifier.js';
import { updateTargetDashboard, generatePalettePreviewHtml } from '../core/dashboard.js';
import { createCloneXSpinner, printSectionHeader } from '../ui/banner.js';
import { askUrl, selectFromMenu, askInput } from '../ui/prompt.js';

const RED = chalk.hex('#EF4444');
const GOLD = chalk.hex('#FBBF24');
const ARC = chalk.hex('#00E5FF');
const DIM = chalk.hex('#52525B');

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

  const htmlCloneDir = path.join(outputDir, '01-html-clone');
  const designSystemDir = path.join(outputDir, '03-design-system');
  const screenshotsDir = path.join(outputDir, '04-screenshots');

  await fs.mkdir(htmlCloneDir, { recursive: true });
  await fs.mkdir(designSystemDir, { recursive: true });
  await fs.mkdir(screenshotsDir, { recursive: true });

  const originalScreenshotPath = path.join(screenshotsDir, 'original.png');
  const cloneScreenshotPath = path.join(screenshotsDir, 'clone-verified.png');

  console.log('');
  console.log(`  ${DIM('TARGET   //')} ${ARC(targetUrl)}`);
  console.log(`  ${DIM('VIEWPORT //')} ${chalk.white(`${viewportWidth}x${viewportHeight} @2x`)}`);
  console.log(`  ${DIM('OUTPUT   //')} ${chalk.white(outputDir)}\n`);

  const spinner = createCloneXSpinner('ENGAGING CHROMIUM CAPTURE').start();
  const startTime = Date.now();

  try {
    const captureData = await captureWebpage(targetUrl, {
      viewportWidth,
      viewportHeight,
      waitExtraMs,
      fullScroll,
      screenshotPath: originalScreenshotPath,
      onProgress: (msg) => spinner.update(msg.toUpperCase())
    });

    const htmlResult = await generateHtmlOutput(captureData, htmlCloneDir, {
      downloadAssets,
      tokensOutputDir: designSystemDir,
      onProgress: (msg) => spinner.update(msg.toUpperCase())
    });

    await generatePalettePreviewHtml(
      captureData.designTokens,
      path.join(designSystemDir, 'palette-preview.html')
    );

    let reactResult = null;
    if (generateReact) {
      reactResult = await generateReactProject(
        htmlResult,
        captureData.designTokens,
        outputDir,
        {
          reactDirName: '02-react-project',
          assetsSourceDir: path.join(htmlCloneDir, 'assets'),
          onProgress: (msg) => spinner.update(msg.toUpperCase())
        }
      );
      await fs
        .copyFile(
          path.join(reactResult.reactDir, 'tailwind.config.js'),
          path.join(designSystemDir, 'tailwind.config.js')
        )
        .catch(() => {});
    }

    let verifyResult = null;
    if (verify) {
      verifyResult = await verifyCloneFidelity({
        outputDir: htmlCloneDir,
        originalScreenshotPath,
        cloneScreenshotPath,
        viewportWidth,
        viewportHeight,
        onProgress: (msg) => spinner.update(msg.toUpperCase())
      });
    }

    const dashboardPath = await updateTargetDashboard(outputDir);

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    spinner.succeed(`TARGET ACQUIRED: "${captureData.title}" [${elapsedSec}s]`);

    console.log('');
    console.log(`  ${RED.bold('▸ ORGANIZED ARTIFACTS')}`);
    console.log(`   ${ARC('◈')} ${GOLD('HUD DASHBOARD ')} ${ARC.bold(dashboardPath)}`);
    console.log(`   ${ARC('◈')} ${GOLD('01 HTML/CSS   ')} ${chalk.white(path.join(htmlCloneDir, 'index.html'))}`);
    console.log(`   ${ARC('◈')} ${GOLD('01 SINGLE FILE')} ${chalk.white(path.join(htmlCloneDir, 'single-file.html'))}`);
    if (downloadAssets) {
      console.log(
        `   ${ARC('◈')} ${GOLD('01 ASSETS     ')} ${chalk.white(`${htmlResult.assetStats.downloadedCount} files -> ${path.join(htmlCloneDir, 'assets')}`)}`
      );
    }
    if (reactResult) {
      console.log(
        `   ${ARC('◈')} ${GOLD('02 REACT APP  ')} ${chalk.white(reactResult.reactDir)} ${DIM(`[${reactResult.components.length} modules]`)}`
      );
    }
    console.log(`   ${ARC('◈')} ${GOLD('03 DESIGN SYS ')} ${chalk.white(designSystemDir)}`);
    console.log(`   ${ARC('◈')} ${GOLD('04 SCREENSHOTS')} ${chalk.white(screenshotsDir)}`);

    if (verifyResult && verifyResult.similarityPercent !== null) {
      console.log(
        `   ${ARC('◈')} ${GOLD('FIDELITY      ')} ${ARC.bold(`${verifyResult.similarityPercent}%`)}`
      );
    }
    console.log('');

    return { outputDir, dashboardPath, captureData, htmlResult, reactResult, verifyResult };
  } catch (err) {
    spinner.fail(`CAPTURE ABORTED: ${err.message}`);
    throw err;
  }
}

export const fullCloneModule = {
  id: 'full-clone',
  category: 'Capture',
  title: '1:1 Webpage Clone',
  description: 'DOM + CSSOM + Assets + React/Tailwind',

  async run(context) {
    printSectionHeader('1:1 Webpage Clone');

    const targetUrl = await askUrl('TARGET URL');
    if (!targetUrl) return;

    console.log('');
    const presets = [
      {
        id: 'full',
        title: 'Full Suite',
        description: 'HTML/CSS + React/Tailwind + Local Assets + Fidelity Check',
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
        title: 'Static HTML/CSS + Assets',
        description: 'Skip React build',
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
        title: 'Mobile Viewport (390x844)',
        description: 'Mobile layout + React build + Assets',
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
        title: 'Rapid Clone (Remote Assets)',
        description: 'Skip local asset download & verification',
        opts: {
          viewportWidth: context.settings.viewportWidth,
          viewportHeight: context.settings.viewportHeight,
          downloadAssets: false,
          generateReact: true,
          verify: false
        }
      }
    ];

    const chosenPreset = await selectFromMenu('MODE', presets, {
      allowBack: true
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
          id: 'dashboard',
          title: 'Open Interactive HUD Dashboard',
          description: path.join(outputDir, 'DASHBOARD.html')
        },
        {
          id: 'preview',
          title: 'Launch Local Server (1:1 HTML Clone)',
          description: `http://localhost:${context.settings.previewPort || 4000}/01-html-clone/index.html`
        },
        {
          id: 'explorer',
          title: 'Open Output Directory in Explorer',
          description: outputDir
        }
      ];

      const nextAction = await selectFromMenu('POST-CAPTURE', postActions, {
        allowBack: true
      });

      if (!nextAction) return;

      if (nextAction.id === 'dashboard') {
        if (process.platform === 'win32') {
          spawn('cmd.exe', ['/c', 'start', '', path.join(outputDir, 'DASHBOARD.html')], {
            detached: true,
            stdio: 'ignore'
          }).unref();
        }
      } else if (nextAction.id === 'explorer') {
        if (process.platform === 'win32') {
          spawn('explorer.exe', [outputDir], { detached: true, stdio: 'ignore' }).unref();
        }
      } else if (nextAction.id === 'preview') {
        const port = context.settings.previewPort || 4000;
        const server = createStaticServer(outputDir);
        await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
        const previewUrl = `http://localhost:${port}/01-html-clone/index.html`;
        console.log(
          `\n  ${chalk.bgHex('#B91C1C').hex('#FBBF24').bold(' ONLINE ')} ${ARC(previewUrl)}`
        );
        if (process.platform === 'win32') {
          spawn('cmd.exe', ['/c', 'start', previewUrl], { detached: true, stdio: 'ignore' }).unref();
        }
        await askInput('ENTER to terminate server');
        server.close();
      }
    } catch {
      await askInput('ENTER to return');
    }
  }
};
