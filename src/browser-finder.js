import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

export function resolveChromiumExecutable() {
  const defaultExec = chromium.executablePath();
  if (defaultExec && fs.existsSync(defaultExec)) {
    return defaultExec;
  }

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

  return null;
}

export async function launchBrowser(args = []) {
  const execPath = resolveChromiumExecutable();
  const launchOpts = {
    headless: true,
    args
  };

  if (execPath) {
    launchOpts.executablePath = execPath;
    return chromium.launch(launchOpts);
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
