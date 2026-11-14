import * as cheerio from 'cheerio';

export const SOCIAL_PATTERNS = [
  ['GitHub', /(^|\.)github\.com$/i],
  ['GitLab', /(^|\.)gitlab\.com$/i],
  ['X/Twitter', /(^|\.)(twitter|x)\.com$/i],
  ['LinkedIn', /(^|\.)linkedin\.com$/i],
  ['Instagram', /(^|\.)instagram\.com$/i],
  ['Facebook', /(^|\.)(facebook|fb)\.com$/i],
  ['YouTube', /(^|\.)(youtube\.com|youtu\.be)$/i],
  ['TikTok', /(^|\.)tiktok\.com$/i],
  ['Discord', /(^|\.)(discord\.gg|discord\.com)$/i],
  ['Telegram', /(^|\.)(t\.me|telegram\.me)$/i],
  ['WhatsApp', /(^|\.)(wa\.me|whatsapp\.com)$/i],
  ['Reddit', /(^|\.)reddit\.com$/i],
  ['Pinterest', /(^|\.)pinterest\.[a-z.]+$/i],
  ['Medium', /(^|\.)medium\.com$/i],
  ['Dribbble', /(^|\.)dribbble\.com$/i],
  ['Behance', /(^|\.)behance\.net$/i],
  ['Twitch', /(^|\.)twitch\.tv$/i],
  ['Threads', /(^|\.)threads\.net$/i],
  ['Mastodon', /(^|\.)mastodon\.[a-z.]+$/i],
  ['Snapchat', /(^|\.)snapchat\.com$/i],
  ['Spotify', /(^|\.)spotify\.com$/i]
];

export const DOCUMENT_EXT = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|csv|txt|md|epub|zip|rar|7z|tar|gz|tgz|dmg|exe|msi|apk|iso|json|xml|ics|vcf)$/i;
export const MEDIA_EXT = /\.(jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|mp4|webm|mov|avi|mkv|mp3|wav|ogg|flac|m4a)$/i;
export const STATIC_EXT = /\.(css|js|mjs|map|woff2?|ttf|otf|eot)$/i;

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_ga|_gl|ref_src|igshid|si)$/i;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,24}/g;
const PHONE_RE = /(?:\+|00)[1-9]\d{0,3}[\s.\-()]*\d{1,4}(?:[\s.\-()]*\d{2,4}){2,4}/g;
const IMAGE_LIKE_EMAIL = /\.(png|jpe?g|gif|webp|svg|avif|css|js)$/i;

export function normalizeUrl(raw, base) {
  try {
    const u = new URL(raw, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    if ((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80')) {
      u.port = '';
    }
    for (const key of Array.from(u.searchParams.keys())) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    let href = u.href;
    if (u.pathname !== '/' && href.endsWith('/') && !u.search) href = href.slice(0, -1);
    return href;
  } catch {
    return null;
  }
}

export function classifyUrl(url) {
  try {
    const p = new URL(url).pathname.toLowerCase();
    if (DOCUMENT_EXT.test(p)) return 'document';
    if (MEDIA_EXT.test(p)) return 'media';
    if (STATIC_EXT.test(p)) return 'static';
    return 'page';
  } catch {
    return 'page';
  }
}

export function detectSocial(url) {
  try {
    const host = new URL(url).hostname;
    for (const [name, re] of SOCIAL_PATTERNS) {
      if (re.test(host)) return name;
    }
  } catch {}
  return null;
}

function cleanEmails(list) {
  const out = new Set();
  for (const raw of list) {
    const e = raw.toLowerCase().replace(/^mailto:/, '').split('?')[0].trim();
    if (!e || IMAGE_LIKE_EMAIL.test(e) || e.length > 100) continue;
    if (/@(example|domain|email|sentry|wixpress)\./.test(e)) continue;
    out.add(e);
  }
  return Array.from(out);
}

function cleanPhones(list) {
  const out = new Set();
  for (const raw of list) {
    const p = raw.replace(/^tel:/i, '').replace(/[^\d+]/g, '');
    const digits = p.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) continue;
    out.add(p);
  }
  return Array.from(out);
}

function detectTech(html, $, headers = {}) {
  const tech = new Set();
  const h = html;
  const gen = $('meta[name="generator"]').attr('content');
  if (gen) tech.add(`Generator: ${gen.trim()}`);
  const checks = [
    ['Next.js', /__NEXT_DATA__|\/_next\/static/],
    ['Nuxt', /__NUXT__|\/_nuxt\//],
    ['Gatsby', /___gatsby|\/page-data\//],
    ['Remix', /__remixContext/],
    ['Astro', /astro-island|data-astro-cid/],
    ['SvelteKit', /__sveltekit|\/_app\/immutable\//],
    ['Angular', /ng-version=|ng-app/],
    ['Vue.js', /data-v-[0-9a-f]{6,}|__VUE__/],
    ['React', /data-reactroot|react-dom|__REACT_DEVTOOLS/],
    ['Vite', /\/@vite\/client|\/assets\/index-[\w-]+\.js/],
    ['WordPress', /wp-content\/|wp-includes\//],
    ['WooCommerce', /woocommerce/i],
    ['Shopify', /cdn\.shopify\.com|Shopify\.theme/],
    ['Wix', /static\.wixstatic\.com|wix-code/],
    ['Squarespace', /squarespace\.com|static1\.squarespace/],
    ['Webflow', /data-wf-site|webflow\.js/],
    ['Framer', /framerusercontent\.com|data-framer/],
    ['Ghost', /ghost-(url|sdk)|content="Ghost/],
    ['Drupal', /Drupal\.settings|\/sites\/default\/files/],
    ['Joomla', /\/media\/jui\/|Joomla!/],
    ['Magento', /Mage\.Cookies|\/static\/version\d+/],
    ['Laravel', /laravel_session|XSRF-TOKEN/],
    ['Tailwind CSS', /class="[^"]*\b(?:flex|grid)\b[^"]*\b(?:px|py|mt|mb|gap)-\d/],
    ['Bootstrap', /bootstrap(\.min)?\.(css|js)|class="[^"]*\bcol-(?:sm|md|lg)-\d/],
    ['jQuery', /jquery(\.min)?\.js|jQuery\(/],
    ['GSAP', /gsap(\.min)?\.js|TweenMax/],
    ['Three.js', /three(\.module)?(\.min)?\.js/],
    ['Alpine.js', /x-data=|alpinejs/],
    ['HTMX', /hx-get=|hx-post=|htmx\.org/],
    ['Google Analytics', /googletagmanager\.com\/gtag|google-analytics\.com|gtag\(/],
    ['Google Tag Manager', /googletagmanager\.com\/gtm\.js/],
    ['Meta Pixel', /connect\.facebook\.net\/.*fbevents\.js/],
    ['Hotjar', /static\.hotjar\.com/],
    ['Plausible', /plausible\.io\/js/],
    ['Vercel Analytics', /\/_vercel\/insights/],
    ['Cloudflare', /cdnjs\.cloudflare\.com|cf-beacon|challenges\.cloudflare/],
    ['reCAPTCHA', /google\.com\/recaptcha/],
    ['hCaptcha', /hcaptcha\.com/],
    ['Stripe', /js\.stripe\.com/],
    ['PayPal', /paypal\.com\/sdk/],
    ['Intercom', /widget\.intercom\.io/],
    ['Crisp', /client\.crisp\.chat/],
    ['Tawk.to', /embed\.tawk\.to/],
    ['HubSpot', /js\.hs-scripts\.com|hubspot/],
    ['Mailchimp', /chimpstatic\.com|list-manage\.com/],
    ['Font Awesome', /font-?awesome/i],
    ['Google Fonts', /fonts\.googleapis\.com/],
    ['Sentry', /browser\.sentry-cdn\.com|@sentry\//]
  ];
  for (const [name, re] of checks) if (re.test(h)) tech.add(name);

  const server = headers['server'];
  if (server) tech.add(`Server: ${server}`);
  if (headers['x-powered-by']) tech.add(`Powered-By: ${headers['x-powered-by']}`);
  if (headers['cf-ray']) tech.add('Cloudflare');
  if (headers['x-vercel-id']) tech.add('Vercel');
  if (headers['x-nf-request-id']) tech.add('Netlify');
  if (headers['x-github-request-id']) tech.add('GitHub Pages');
  if (headers['x-amz-cf-id']) tech.add('AWS CloudFront');
  if (headers['x-served-by'] && /cache/i.test(headers['x-served-by'])) tech.add('Fastly');
  return Array.from(tech);
}

function htmlToMarkdown($, root) {
  const out = [];
  const inline = (el) =>
    $(el)
      .text()
      .replace(/\s+/g, ' ')
      .trim();

  const walk = (nodes) => {
    nodes.each((_, node) => {
      if (node.type !== 'tag') return;
      const tag = node.name;
      if (/^h[1-6]$/.test(tag)) {
        const t = inline(node);
        if (t) out.push(`${'#'.repeat(Number(tag[1]))} ${t}`);
      } else if (tag === 'p' || tag === 'blockquote' || tag === 'figcaption') {
        const t = inline(node);
        if (t) out.push(tag === 'blockquote' ? `> ${t}` : t);
      } else if (tag === 'ul' || tag === 'ol') {
        $(node)
          .children('li')
          .each((i, li) => {
            const t = inline(li);
            if (t) out.push(`${tag === 'ol' ? `${i + 1}.` : '-'} ${t}`);
          });
      } else if (tag === 'pre') {
        out.push('```\n' + $(node).text().trim() + '\n```');
      } else if (tag === 'table') {
        const rows = $(node)
          .find('tr')
          .toArray()
          .map((tr) =>
            $(tr)
              .children('th,td')
              .toArray()
              .map((c) => inline(c).replace(/\|/g, '\\|'))
          )
          .filter((r) => r.length);
        if (rows.length) {
          const width = Math.max(...rows.map((r) => r.length));
          const pad = (r) => [...r, ...Array(width - r.length).fill('')];
          out.push(`| ${pad(rows[0]).join(' | ')} |`);
          out.push(`| ${Array(width).fill('---').join(' | ')} |`);
          rows.slice(1).forEach((r) => out.push(`| ${pad(r).join(' | ')} |`));
        }
      } else if (tag === 'img') {
        const alt = $(node).attr('alt');
        const src = $(node).attr('src');
        if (src) out.push(`![${alt || ''}](${src})`);
      } else {
        walk($(node).contents());
      }
    });
  };

  walk($(root).contents());
  return out.join('\n\n');
}

export function extractPage(html, pageUrl, headers = {}) {
  const $ = cheerio.load(html);
  const base = $('base[href]').attr('href') ? normalizeUrl($('base[href]').attr('href'), pageUrl) || pageUrl : pageUrl;
  const pageHost = new URL(pageUrl).hostname;

  const meta = (sel) => $(sel).attr('content')?.trim() || null;
  const metaTags = {};
  $('meta').each((_, el) => {
    const key = $(el).attr('name') || $(el).attr('property') || $(el).attr('itemprop') || $(el).attr('http-equiv');
    const val = $(el).attr('content');
    if (key && val && !metaTags[key]) metaTags[key] = val.trim();
  });

  const tech = detectTech(html, $, headers);

  const jsonLd = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      jsonLd.push(JSON.parse($(el).contents().text()));
    } catch {}
  });

  const scripts = [];
  const inlineScripts = [];
  $('script').each((_, el) => {
    const src = $(el).attr('src');
    if (src) {
      const abs = normalizeUrl(src, base);
      if (abs) scripts.push(abs);
    } else {
      const code = $(el).contents().text();
      if (code && code.length < 400000) inlineScripts.push(code);
    }
  });

  const stylesheets = $('link[rel="stylesheet"][href]')
    .map((_, el) => normalizeUrl($(el).attr('href'), base))
    .get()
    .filter(Boolean);

  const iframes = $('iframe[src]')
    .map((_, el) => normalizeUrl($(el).attr('src'), base))
    .get()
    .filter(Boolean);

  const feeds = $('link[type="application/rss+xml"], link[type="application/atom+xml"]')
    .map((_, el) => normalizeUrl($(el).attr('href'), base))
    .get()
    .filter(Boolean);

  const alternates = $('link[rel="alternate"][hreflang]')
    .map((_, el) => ({ lang: $(el).attr('hreflang'), url: normalizeUrl($(el).attr('href'), base) }))
    .get()
    .filter((a) => a.url);

  const links = [];
  const emailsRaw = [];
  const phonesRaw = [];
  $('a[href], area[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return;
    if (/^mailto:/i.test(href)) return emailsRaw.push(href);
    if (/^(tel|callto):/i.test(href)) return phonesRaw.push(href);
    const abs = normalizeUrl(href, base);
    if (!abs) return;
    links.push({
      url: abs,
      text: ($(el).text() || $(el).attr('aria-label') || $(el).attr('title') || '').replace(/\s+/g, ' ').trim().slice(0, 140),
      rel: $(el).attr('rel') || null,
      internal: new URL(abs).hostname === pageHost
    });
  });

  const images = new Map();
  const addImage = (src, alt = '') => {
    if (!src || src.startsWith('data:')) return;
    const abs = normalizeUrl(src, base);
    if (abs && !images.has(abs)) images.set(abs, { url: abs, alt: alt || '' });
  };
  $('img').each((_, el) => {
    const $el = $(el);
    const alt = $el.attr('alt') || '';
    addImage($el.attr('src'), alt);
    for (const attr of ['data-src', 'data-lazy-src', 'data-original', 'data-lazy']) addImage($el.attr(attr), alt);
    const srcset = $el.attr('srcset') || $el.attr('data-srcset');
    if (srcset) srcset.split(',').forEach((part) => addImage(part.trim().split(/\s+/)[0], alt));
  });
  $('source[srcset]').each((_, el) => {
    $(el)
      .attr('srcset')
      .split(',')
      .forEach((part) => addImage(part.trim().split(/\s+/)[0]));
  });
  $('[style*="url("]').each((_, el) => {
    const style = $(el).attr('style') || '';
    for (const m of style.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) addImage(m[1]);
  });
  addImage(meta('meta[property="og:image"]'));
  addImage(meta('meta[name="twitter:image"]'));
  $('link[rel*="icon"][href]').each((_, el) => addImage($(el).attr('href')));

  const videos = [];
  $('video[src], video source[src], audio[src], audio source[src]').each((_, el) => {
    const abs = normalizeUrl($(el).attr('src'), base);
    if (abs) videos.push(abs);
  });
  iframes.forEach((src) => {
    if (/youtube\.com\/embed|player\.vimeo\.com|youtube-nocookie/.test(src)) videos.push(src);
  });

  const forms = $('form')
    .map((_, f) => ({
      action: normalizeUrl($(f).attr('action') || '', base) || pageUrl,
      method: ($(f).attr('method') || 'GET').toUpperCase(),
      id: $(f).attr('id') || null,
      fields: $(f)
        .find('input, select, textarea, button[name]')
        .map((__, i) => ({
          tag: i.name,
          name: $(i).attr('name') || $(i).attr('id') || null,
          type: $(i).attr('type') || (i.name === 'input' ? 'text' : i.name),
          required: $(i).attr('required') !== undefined,
          placeholder: $(i).attr('placeholder') || null
        }))
        .get()
        .filter((x) => x.name || x.type !== 'hidden')
    }))
    .get();

  const headings = {};
  for (let i = 1; i <= 6; i++) {
    const list = $(`h${i}`)
      .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(Boolean);
    if (list.length) headings[`h${i}`] = list.slice(0, 100);
  }

  const tables = $('table')
    .slice(0, 50)
    .map((_, t) => {
      const rows = $(t)
        .find('tr')
        .toArray()
        .map((tr) =>
          $(tr)
            .children('th,td')
            .toArray()
            .map((c) => $(c).text().replace(/\s+/g, ' ').trim())
        )
        .filter((r) => r.length);
      return { caption: $(t).find('caption').text().trim() || null, rows };
    })
    .get()
    .filter((t) => t.rows.length);

  const $content = cheerio.load(html);
  $content('script, style, noscript, svg, template, iframe, canvas').remove();
  const contentRoot = $content('main').first().length
    ? $content('main').first()
    : $content('article').first().length
      ? $content('article').first()
      : $content('body');
  const markdown = htmlToMarkdown($content, contentRoot);
  const bodyText = $content('body').text().replace(/\s+/g, ' ').trim();

  emailsRaw.push(...(bodyText.match(EMAIL_RE) || []));
  emailsRaw.push(...(html.match(EMAIL_RE) || []).filter((e) => !IMAGE_LIKE_EMAIL.test(e)));
  phonesRaw.push(...(bodyText.match(PHONE_RE) || []));

  const socials = [];
  const seenSocial = new Set();
  for (const l of links) {
    const platform = detectSocial(l.url);
    if (platform && !seenSocial.has(l.url)) {
      seenSocial.add(l.url);
      socials.push({ platform, url: l.url });
    }
  }

  const documents = links.filter((l) => classifyUrl(l.url) === 'document').map((l) => ({ url: l.url, text: l.text }));

  const endpoints = extractEndpointsFromJs(inlineScripts.join('\n'), base);

  return {
    url: pageUrl,
    title: $('title').first().text().replace(/\s+/g, ' ').trim(),
    description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
    keywords: meta('meta[name="keywords"]'),
    canonical: normalizeUrl($('link[rel="canonical"]').attr('href') || '', base),
    robotsMeta: meta('meta[name="robots"]'),
    language: $('html').attr('lang') || null,
    metaTags,
    headings,
    wordCount: bodyText ? bodyText.split(' ').length : 0,
    text: bodyText,
    markdown,
    links,
    images: Array.from(images.values()),
    videos: Array.from(new Set(videos)),
    documents,
    emails: cleanEmails(emailsRaw),
    phones: cleanPhones(phonesRaw),
    socials,
    forms,
    tables,
    scripts: Array.from(new Set(scripts)),
    stylesheets: Array.from(new Set(stylesheets)),
    iframes: Array.from(new Set(iframes)),
    feeds: Array.from(new Set(feeds)),
    alternates,
    jsonLd,
    tech,
    endpoints
  };
}

const NOISE_ENDPOINT_RE =
  /^https?:\/\/(www\.)?(w3\.org|schema\.org|json-schema\.org|reactjs\.org|react\.dev|vuejs\.org|angular\.io|svelte\.dev|github\.com\/(facebook|zloirock|browserslist)|example\.com|your-app\.com|localhost:\d+|127\.0\.0\.1|a\/|xn--)/i;

export function extractEndpointsFromJs(code, base) {
  if (!code) return [];
  const found = new Set();
  const patterns = [
    /["'`](https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^"'`\s<>{}]*)?)["'`]/g,
    /["'`](\/(?:api|v\d|graphql|rest|wp-json|auth|oauth|admin|organization|api-key|internal|services?|ajax|rpc|gql|trpc|webhook|webhooks)\b[^"'`\s<>{}]{0,180})["'`]/gi,
    /fetch\(\s*["'`]([^"'`\s]+)["'`]/g,
    /axios\.(?:get|post|put|patch|delete)\(\s*["'`]([^"'`\s]+)["'`]/g,
    /\.open\(\s*["'`](?:GET|POST|PUT|DELETE|PATCH)["'`]\s*,\s*["'`]([^"'`\s]+)["'`]/gi
  ];
  for (const re of patterns) {
    for (const m of code.matchAll(re)) {
      const raw = m[1]?.trim();
      if (
        !raw ||
        raw.length < 4 ||
        raw.includes('${') ||
        raw.includes(' ') ||
        /\/\/\/|\.\.\.|\/_next\b/i.test(raw) ||
        /\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot|css|less|scss|sass|js|mjs|map|mp4|webm|mp3)\/?(\?|$)/i.test(raw)
      ) {
        continue;
      }
      try {
        const resolved = new URL(raw, base);
        if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
        if (!resolved.hostname.includes('.')) continue;
        if (NOISE_ENDPOINT_RE.test(resolved.href)) continue;
        found.add(resolved.href);
      } catch {}
    }
  }
  return Array.from(found).slice(0, 500);
}
