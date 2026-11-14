#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const C_RESET = '\x1b[0m';
const C_BOLD = '\x1b[1m';
const C_CYAN = '\x1b[36m';
const C_GREEN = '\x1b[32m';
const C_RED = '\x1b[31m';
const C_YELLOW = '\x1b[33m';
const C_GRAY = '\x1b[90m';

function askYesNo(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(`  ${C_CYAN}${C_BOLD}?${C_RESET} ${C_BOLD}${question} (Y/N): ${C_RESET}`, (ans) => {
      rl.close();
      const clean = ans.trim().toLowerCase();
      resolve(clean === 'y' || clean === 'yes' || clean === '');
    });
  });
}

function getRequiredPackages() {
  try {
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8')
    );
    return Object.keys(pkgJson.dependencies || {});
  } catch {
    return ['chalk', 'cheerio', 'commander', 'ora', 'playwright', 'pngjs', 'prettier'];
  }
}

function checkInstalledPackages(requiredList) {
  const missing = [];
  const installed = [];

  for (const pkg of requiredList) {
    const pkgPath = path.join(ROOT_DIR, 'node_modules', pkg, 'package.json');
    if (fs.existsSync(pkgPath)) {
      installed.push(pkg);
    } else {
      missing.push(pkg);
    }
  }

  return { installed, missing };
}

function findAvailableBrowserBinary() {
  const localAppData =
    process.env.LOCALAPPDATA ||
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
  const pwCacheDir = path.join(localAppData, 'ms-playwright');

  if (fs.existsSync(pwCacheDir)) {
    try {
      const entries = fs
        .readdirSync(pwCacheDir)
        .filter((name) => name.startsWith('chromium-'))
        .sort()
        .reverse();

      for (const dirName of entries) {
        const candidates = [
          path.join(pwCacheDir, dirName, 'chrome-win64', 'chrome.exe'),
          path.join(pwCacheDir, dirName, 'chrome-win', 'chrome.exe'),
          path.join(pwCacheDir, dirName, 'chrome-linux', 'chrome')
        ];
        for (const candidate of candidates) {
          if (fs.existsSync(candidate)) {
            return { name: `Playwright ${dirName}`, path: candidate };
          }
        }
      }
    } catch {}
  }

  const systemCandidates = [
    {
      name: 'Google Chrome',
      path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    },
    {
      name: 'Google Chrome (x86)',
      path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    },
    {
      name: 'Google Chrome (User)',
      path: path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe')
    },
    {
      name: 'Microsoft Edge',
      path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    },
    {
      name: 'Microsoft Edge',
      path: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    },
    { name: 'Google Chrome', path: '/usr/bin/google-chrome' },
    { name: 'Chromium', path: '/usr/bin/chromium-browser' },
    {
      name: 'Google Chrome',
      path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    }
  ];

  for (const item of systemCandidates) {
    if (fs.existsSync(item.path)) {
      return item;
    }
  }

  return null;
}

async function ensureDependencies() {
  const requiredPkgs = getRequiredPackages();
  let { installed, missing } = checkInstalledPackages(requiredPkgs);

  if (missing.length > 0) {
    console.log(`\n  ${C_CYAN}${C_BOLD}CloneX Pre-Flight Dependency Check${C_RESET}`);
    console.log(`  ${C_GRAY}─────────────────────────────────────────────────────────${C_RESET}`);

    for (const pkg of installed) {
      console.log(`   ${C_GREEN}✔${C_RESET} ${pkg.padEnd(18, ' ')} ${C_GRAY}installed${C_RESET}`);
    }
    for (const pkg of missing) {
      console.log(`   ${C_RED}✖${C_RESET} ${pkg.padEnd(18, ' ')} ${C_YELLOW}missing${C_RESET}`);
    }
    console.log('');

    const approved = await askYesNo(
      `Missing ${missing.length} required dependency package(s). Install them now?`
    );
    if (!approved) {
      console.log(
        `\n  ${C_RED}✖ Cannot start CloneX without required dependencies. Exiting.${C_RESET}\n`
      );
      process.exit(1);
    }

    console.log(`\n  ${C_CYAN}Installing npm dependencies...${C_RESET}\n`);
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const res = spawnSync(npmCmd, ['install'], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      shell: true
    });

    if (res.status !== 0) {
      console.error(`\n  ${C_RED}✖ Failed to install npm dependencies.${C_RESET}`);
      process.exit(1);
    }

    ({ installed, missing } = checkInstalledPackages(requiredPkgs));
    if (missing.length > 0) {
      console.error(`\n  ${C_RED}✖ Still missing packages: ${missing.join(', ')}${C_RESET}`);
      process.exit(1);
    }
    console.log(`\n  ${C_GREEN}✔ All npm packages installed successfully!${C_RESET}\n`);
  }

  let browserInfo = findAvailableBrowserBinary();
  if (!browserInfo) {
    console.log(`\n  ${C_YELLOW}⚠ No local Chromium/Chrome browser engine detected.${C_RESET}`);
    const installBrowser = await askYesNo(
      'Download & install Playwright Chromium browser engine now?'
    );
    if (!installBrowser) {
      console.log(
        `\n  ${C_RED}✖ Browser engine is required to capture webpages. Exiting.${C_RESET}\n`
      );
      process.exit(1);
    }

    console.log(`\n  ${C_CYAN}Downloading Playwright Chromium...${C_RESET}\n`);
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const res = spawnSync(npxCmd, ['playwright', 'install', 'chromium'], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      shell: true
    });

    if (res.status !== 0) {
      console.error(`\n  ${C_RED}✖ Failed to install Playwright Chromium.${C_RESET}`);
      process.exit(1);
    }
    browserInfo = findAvailableBrowserBinary() || { name: 'Playwright Chromium' };
  }

  return [
    { name: 'Node.js Runtime', detail: process.version },
    {
      name: 'Core NPM Packages',
      detail: `${installed.length}/${requiredPkgs.length} verified (${installed.join(', ')})`
    },
    { name: 'Browser Engine', detail: browserInfo.name }
  ];
}

const depSummary = await ensureDependencies();
const { runCli } = await import('../src/cli.js');
await runCli(depSummary);
