import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { resolveHostIp } from './core/net.js';

export { resolveHostIp };

export function resolveChromiumExecutable() {
  try {
    const defaultExec = chromium.executablePath();
    if (defaultExec && fs.existsSync(defaultExec)) {
      return defaultExec;
    }
  } catch {}

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
            return candidate;
          }
        }
      }
    } catch {}
  }

  const systemCandidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];

  for (const sysPath of systemCandidates) {
    if (fs.existsSync(sysPath)) {
      return sysPath;
    }
  }

  return null;
}

function collectHosts(targets) {
  const list = Array.isArray(targets) ? targets : targets ? [targets] : [];
  const hosts = new Set();
  for (const t of list) {
    if (!t) continue;
    try {
      hosts.add(new URL(t.includes('://') ? t : `https://${t}`).hostname);
    } catch {}
  }
  for (const h of Array.from(hosts)) {
    if (!h.startsWith('www.') && h.split('.').length === 2) hosts.add(`www.${h}`);
  }
  return Array.from(hosts);
}

export async function launchBrowser(args = [], targets = null) {
  const execPath = resolveChromiumExecutable();
  const finalArgs = [...args];

  const hosts = collectHosts(targets).slice(0, 200);
  if (hosts.length) {
    const rules = [];
    await Promise.all(
      hosts.map(async (host) => {
        const ip = await resolveHostIp(host);
        if (ip) rules.push(`MAP ${host} ${ip}`);
      })
    );
    if (rules.length) finalArgs.push(`--host-resolver-rules=${rules.join(', ')}`);
  }

  const launchOpts = { headless: true, args: finalArgs };

  if (execPath) {
    return chromium.launch({ ...launchOpts, executablePath: execPath });
  }

  try {
    return await chromium.launch(launchOpts);
  } catch {
    try {
      return await chromium.launch({ ...launchOpts, channel: 'chrome' });
    } catch {
      return await chromium.launch({ ...launchOpts, channel: 'msedge' });
    }
  }
}

export async function navigateSafely(page, targetUrl, timeoutMs = 35000) {
  let response = null;
  try {
    response = await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: timeoutMs });
  } catch (err) {
    const msg = String(err.message || err);
    if (/timeout/i.test(msg)) {
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2500);
    } else {
      throw err;
    }
  }

  const currentUrl = page.url();
  if (currentUrl.startsWith('chrome-error://') || currentUrl.startsWith('about:neterror')) {
    throw new Error(`Unable to reach ${targetUrl} (DNS or connection failed)`);
  }
  return response;
}
