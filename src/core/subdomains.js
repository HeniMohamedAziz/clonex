import * as cheerio from 'cheerio';
import { resolver, httpGet, runPool, getRootDomain } from './net.js';

const WORDLIST = [
  'www', 'm', 'mobile', 'app', 'apps', 'web', 'portal', 'my', 'account', 'accounts', 'login', 'auth', 'sso', 'id',
  'api', 'api2', 'apis', 'graphql', 'gateway', 'dev', 'develop', 'staging', 'stage', 'test', 'qa', 'uat', 'beta',
  'alpha', 'demo', 'preview', 'sandbox', 'blog', 'news', 'docs', 'doc', 'wiki', 'kb', 'help', 'support', 'status',
  'community', 'forum', 'forums', 'shop', 'store', 'pay', 'checkout', 'billing', 'cdn', 'static', 'assets', 'media',
  'img', 'images', 'files', 'download', 'downloads', 'mail', 'webmail', 'email', 'smtp', 'mx', 'admin', 'dashboard',
  'panel', 'console', 'cp', 'cpanel', 'crm', 'erp', 'hr', 'careers', 'jobs', 'about', 'events', 'learn', 'academy',
  'courses', 'go', 'link', 'links', 'bio', 'cv', 'resume', 'portfolio', 'en', 'fr', 'ar', 'de', 'es', 'old', 'new',
  'v1', 'v2', 'git', 'gitlab', 'jenkins', 'ci', 'monitor', 'grafana', 'analytics', 'stats', 'track', 'vpn', 'remote',
  'server', 'ns1', 'ns2', 'cloud', 'hub', 'labs', 'lab', 'partners', 'affiliate', 'developer', 'developers', 'dev-api'
];

export async function enumerateFromCertificates(rootDomain) {
  const res = await httpGet(`https://crt.sh/?q=%25.${encodeURIComponent(rootDomain)}&output=json`, {
    timeoutMs: 45000,
    headers: { Accept: 'application/json' }
  });
  if (!res.ok || !res.body) return [];
  try {
    const rows = JSON.parse(res.body);
    const hosts = new Set();
    for (const row of rows) {
      for (const name of String(row.name_value || '').split(/\s+/)) {
        const h = name.trim().toLowerCase().replace(/^\*\./, '');
        if (h && (h === rootDomain || h.endsWith(`.${rootDomain}`)) && !h.includes('*')) hosts.add(h);
      }
    }
    return Array.from(hosts);
  } catch {
    return [];
  }
}

export async function enumerateFromHackerTarget(rootDomain) {
  const res = await httpGet(`https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(rootDomain)}`, {
    timeoutMs: 20000
  });
  if (!res.ok || !res.body || /error|API count/i.test(res.body.slice(0, 80))) return [];
  return res.body
    .split(/\r?\n/)
    .map((line) => line.split(',')[0].trim().toLowerCase())
    .filter((h) => h && (h === rootDomain || h.endsWith(`.${rootDomain}`)));
}

export async function fetchArchivedUrls(domain, { includeSubdomains = true, limit = 5000 } = {}) {
  const target = includeSubdomains ? `*.${domain}` : domain;
  const res = await httpGet(
    `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(target)}/*&output=json&fl=original,statuscode,mimetype&collapse=urlkey&limit=${limit}`,
    { timeoutMs: 60000, headers: { Accept: 'application/json' } }
  );
  if (!res.ok || !res.body) return [];
  try {
    const rows = JSON.parse(res.body);
    return rows
      .slice(1)
      .map(([original, statuscode, mimetype]) => ({ url: original, status: statuscode, mime: mimetype }))
      .filter((r) => /^https?:\/\//i.test(r.url));
  } catch {
    return [];
  }
}

async function detectWildcard(rootDomain) {
  const probe = `zz-${Math.random().toString(36).slice(2, 10)}-nx.${rootDomain}`;
  try {
    const ips = await resolver.resolve4(probe);
    return new Set(ips);
  } catch {
    return null;
  }
}

async function bruteforceSubdomains(rootDomain, onProgress, shouldStop) {
  const wildcard = await detectWildcard(rootDomain);
  const found = [];
  let done = 0;
  await runPool(
    WORDLIST,
    25,
    async (word) => {
      const host = `${word}.${rootDomain}`;
      try {
        const ips = await resolver.resolve4(host);
        if (ips.length && !(wildcard && ips.every((ip) => wildcard.has(ip)))) found.push(host);
      } catch {}
      done++;
      if (done % 10 === 0) onProgress(`DNS SWEEP [${done}/${WORDLIST.length}] ${host}`);
    },
    shouldStop
  );
  return found;
}

export async function probeHost(host) {
  const record = { host, ips: [], alive: false, url: null, status: null, title: null, server: null, redirect: null };
  try {
    record.ips = await resolver.resolve4(host);
  } catch {
    try {
      const cname = await resolver.resolveCname(host);
      record.cname = cname[0];
    } catch {}
  }
  if (!record.ips.length && !record.cname) return record;

  for (const scheme of ['https', 'http']) {
    const res = await httpGet(`${scheme}://${host}/`, { timeoutMs: 10000, maxBytes: 2 * 1024 * 1024 });
    if (res.status) {
      record.alive = true;
      record.url = `${scheme}://${host}/`;
      record.status = res.status;
      record.server = res.headers['server'] || null;
      if (res.url && new URL(res.url).hostname !== host) record.redirect = res.url;
      if (res.body && res.contentType.includes('html')) {
        try {
          record.title = cheerio.load(res.body)('title').first().text().trim().slice(0, 140) || null;
        } catch {}
      }
      break;
    }
  }
  return record;
}

export async function discoverSubdomains(inputHost, options = {}) {
  const {
    useCertificates = true,
    usePassiveApis = true,
    useBruteforce = true,
    useArchive = true,
    probe = true,
    onProgress = () => {},
    shouldStop = () => false
  } = options;

  const rootDomain = getRootDomain(inputHost);
  const sources = {};
  const all = new Set([rootDomain, inputHost]);
  const add = (list, source) => {
    for (const h of list) {
      const host = h.toLowerCase();
      if (!(host === rootDomain || host.endsWith(`.${rootDomain}`))) continue;
      all.add(host);
      (sources[host] ||= new Set()).add(source);
    }
  };

  const tasks = [];
  if (useCertificates) {
    onProgress('QUERYING CERTIFICATE TRANSPARENCY LOGS');
    tasks.push(enumerateFromCertificates(rootDomain).then((l) => add(l, 'crt.sh')));
  }
  if (usePassiveApis) {
    tasks.push(enumerateFromHackerTarget(rootDomain).then((l) => add(l, 'hackertarget')));
  }
  let archived = [];
  if (useArchive) {
    tasks.push(
      fetchArchivedUrls(rootDomain, { includeSubdomains: true, limit: 8000 }).then((rows) => {
        archived = rows;
        const hosts = new Set();
        for (const r of rows) {
          try {
            hosts.add(new URL(r.url).hostname.toLowerCase());
          } catch {}
        }
        add(Array.from(hosts), 'wayback');
      })
    );
  }
  await Promise.all(tasks);

  if (useBruteforce && !shouldStop()) {
    const brute = await bruteforceSubdomains(rootDomain, onProgress, shouldStop);
    add(brute, 'dns-sweep');
  }
  add([inputHost, rootDomain], 'input');

  const hosts = Array.from(all).filter((h) => !h.includes('*')).sort();
  let results = hosts.map((host) => ({ host, sources: Array.from(sources[host] || []) }));

  if (probe && !shouldStop()) {
    let done = 0;
    const probed = await runPool(
      hosts,
      12,
      async (host) => {
        const r = await probeHost(host);
        done++;
        onProgress(`PROBING [${done}/${hosts.length}] ${host}`);
        return r;
      },
      shouldStop
    );
    results = hosts.map((host, i) => ({ ...(probed[i] || { host }), sources: Array.from(sources[host] || []) }));
  }

  return { rootDomain, subdomains: results, archivedUrls: archived };
}
