import fs from 'fs';
import path from 'path';
import dns from 'dns';
import { chromium } from 'playwright';

try {
  dns.setServers(['1.1.1.1', '8.8.8.8', '1.0.0.1', '8.8.4.4']);
} catch {}

const customResolver = new dns.promises.Resolver();
customResolver.setServers(['1.1.1.1', '8.8.8.8', '1.0.0.1', '8.8.4.4']);

const origLookup = dns.lookup.bind(dns);
dns.lookup = function patchedLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const opts = typeof options === 'number' ? { family: options } : options || {};

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return origLookup(hostname, opts, callback);
  }

  customResolver
    .resolve4(hostname)
    .then((ips) => {
      if (ips && ips.length > 0) {
        if (opts.all) {
          return callback(
            null,
            ips.map((address) => ({ address, family: 4 }))
          );
        }
        return callback(null, ips[0], 4);
      }
      return origLookup(hostname, opts, callback);
    })
    .catch(() => {
      return origLookup(hostname, opts, callback);
    });
};

export async function resolveHostIp(hostname) {
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') return null;
  try {
    const ips = await customResolver.resolve4(hostname);
    if (ips && ips.length > 0) return ips[0];
  } catch {}

  try {
    const res = await fetch(
      `https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
      { headers: { accept: 'application/dns-json' } }
    );
    if (res.ok) {
      const data = await res.json();
      const answer = (data.Answer || []).find((a) => a.type === 1 && a.data);
      if (answer) return answer.data;
    }
  } catch {}

  return null;
}

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

export async function launchBrowser(args = [], targetUrl = null) {
  const execPath = resolveChromiumExecutable();
  const finalArgs = [
    ...args,
    '--enable-features=AsyncDns,DnsOverHttps',
    '--force-fieldtrials=DoHTrial/Group1',
    '--force-fieldtrial-params=DoHTrial.Group1:server/https%3A%2F%2F1.1.1.1%2Fdns-query/method/POST'
  ];

  if (targetUrl) {
    try {
      const parsed = new URL(targetUrl);
      const host = parsed.hostname;
      const ip = await resolveHostIp(host);
      if (ip) {
        const rules = [`MAP ${host} ${ip}`];
        if (!host.startsWith('www.')) {
          const wwwIp = await resolveHostIp(`www.${host}`);
          if (wwwIp) rules.push(`MAP www.${host} ${wwwIp}`);
        }
        finalArgs.push(`--host-resolver-rules=${rules.join(', ')}`);
      }
    } catch {}
  }

  const launchOpts = {
    headless: true,
    args: finalArgs
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

export async function navigateSafely(page, targetUrl, timeoutMs = 35000) {
  try {
    await page.goto(targetUrl, {
      waitUntil: 'networkidle',
      timeout: timeoutMs
    });
  } catch (err) {
    const msg = String(err.message || err);
    if (msg.includes('Timeout') || msg.includes('timeout')) {
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
}
