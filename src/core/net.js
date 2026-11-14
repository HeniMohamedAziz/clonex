import dns from 'dns';

const RESOLVERS = ['1.1.1.1', '8.8.8.8', '1.0.0.1', '8.8.4.4'];

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

try {
  dns.setServers(RESOLVERS);
} catch {}

export const resolver = new dns.promises.Resolver({ timeout: 4000, tries: 2 });
resolver.setServers(RESOLVERS);

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const lookupCache = new Map();
const nativeLookup = dns.lookup.bind(dns);

dns.lookup = function patchedLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const opts = typeof options === 'number' ? { family: options } : options || {};

  if (LOCAL_HOSTS.has(hostname) || opts.family === 6) {
    return nativeLookup(hostname, opts, callback);
  }

  const reply = (ips) => {
    if (opts.all) return callback(null, ips.map((address) => ({ address, family: 4 })));
    return callback(null, ips[0], 4);
  };

  const cached = lookupCache.get(hostname);
  if (cached) return process.nextTick(() => reply(cached));

  resolver
    .resolve4(hostname)
    .then((ips) => {
      if (ips && ips.length) {
        lookupCache.set(hostname, ips);
        return reply(ips);
      }
      nativeLookup(hostname, opts, callback);
    })
    .catch(() => nativeLookup(hostname, opts, callback));
};

export async function resolveHostIp(hostname) {
  if (!hostname || LOCAL_HOSTS.has(hostname)) return null;
  const cached = lookupCache.get(hostname);
  if (cached) return cached[0];

  try {
    const ips = await resolver.resolve4(hostname);
    if (ips && ips.length) {
      lookupCache.set(hostname, ips);
      return ips[0];
    }
  } catch {}

  try {
    const res = await fetch(
      `https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
      { headers: { accept: 'application/dns-json' } }
    );
    if (res.ok) {
      const data = await res.json();
      const ips = (data.Answer || []).filter((a) => a.type === 1).map((a) => a.data);
      if (ips.length) {
        lookupCache.set(hostname, ips);
        return ips[0];
      }
    }
  } catch {}

  return null;
}

export async function httpGet(url, options = {}) {
  const {
    timeoutMs = 15000,
    userAgent = DEFAULT_USER_AGENT,
    method = 'GET',
    asBuffer = false,
    maxBytes = 15 * 1024 * 1024,
    headers = {}
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...headers
      }
    });

    const responseHeaders = Object.fromEntries(res.headers.entries());
    const contentType = (responseHeaders['content-type'] || '').toLowerCase();
    const declaredLength = parseInt(responseHeaders['content-length'] || '0', 10);

    let body = null;
    if (method !== 'HEAD' && (!declaredLength || declaredLength <= maxBytes)) {
      const buf = Buffer.from(await res.arrayBuffer());
      body = asBuffer ? buf : buf.toString('utf-8');
    }

    return {
      ok: res.ok,
      status: res.status,
      url: res.url || url,
      headers: responseHeaders,
      contentType,
      body,
      elapsedMs: Date.now() - started
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      url,
      headers: {},
      contentType: '',
      body: null,
      error: err.name === 'AbortError' ? 'timeout' : err.message,
      elapsedMs: Date.now() - started
    };
  } finally {
    clearTimeout(timer);
  }
}

const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'ltd.uk', 'plc.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'org.nz', 'co.za', 'org.za', 'co.jp', 'ne.jp', 'or.jp', 'co.kr', 'or.kr',
  'com.br', 'net.br', 'org.br', 'com.mx', 'com.ar', 'com.co', 'com.pe', 'com.ve',
  'com.tn', 'org.tn', 'net.tn', 'gov.tn', 'edu.tn', 'com.eg', 'com.sa', 'com.tr',
  'com.cn', 'net.cn', 'org.cn', 'com.hk', 'com.tw', 'com.sg', 'com.my', 'com.ph',
  'co.in', 'net.in', 'org.in', 'co.id', 'co.il', 'com.pk', 'com.ng', 'co.ke',
  'com.ua', 'com.pl', 'co.th', 'com.vn', 'gouv.fr', 'com.es', 'co.it'
]);

export function getRootDomain(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return host;
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return parts.slice(-3).join('.');
  return lastTwo;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runPool(items, concurrency, worker, shouldStop = () => false) {
  const results = new Array(items.length);
  let cursor = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (cursor < items.length && !shouldStop()) {
      const idx = cursor++;
      try {
        results[idx] = await worker(items[idx], idx);
      } catch (err) {
        results[idx] = { error: err.message };
      }
    }
  });
  await Promise.all(lanes);
  return results;
}
