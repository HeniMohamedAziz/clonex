import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'font/woff2': '.woff2',
  'font/woff': '.woff',
  'font/ttf': '.ttf',
  'font/otf': '.otf',
  'application/font-woff2': '.woff2',
  'application/font-woff': '.woff',
  'application/x-font-ttf': '.ttf',
  'application/x-font-opentype': '.otf',
  'video/mp4': '.mp4',
  'video/webm': '.webm'
};

const FONT_EXTENSIONS = new Set(['.woff2', '.woff', '.ttf', '.otf', '.eot']);

function sanitizeFilename(urlStr, contentType = '') {
  try {
    const parsed = new URL(urlStr);
    const base = path.basename(parsed.pathname).replace(/[^a-zA-Z0-9._-]/g, '_');
    let ext = path.extname(base).toLowerCase();
    const cleanContentType = contentType.split(';')[0].trim().toLowerCase();

    if (!ext || ext.length > 6) {
      ext = MIME_EXTENSIONS[cleanContentType] || '.bin';
    }
    const nameWithoutExt = path.basename(base, path.extname(base)).slice(0, 40) || 'asset';
    const hash = crypto.createHash('md5').update(urlStr).digest('hex').slice(0, 8);
    return `${nameWithoutExt}-${hash}${ext}`;
  } catch {
    const hash = crypto.createHash('md5').update(urlStr).digest('hex').slice(0, 10);
    return `asset-${hash}.bin`;
  }
}

function isFontAsset(filename, contentType = '') {
  const ext = path.extname(filename).toLowerCase();
  if (FONT_EXTENSIONS.has(ext)) return true;
  if (contentType.includes('font')) return true;
  return false;
}

export async function downloadAndRewriteAssets({
  cssText,
  $,
  baseUrl,
  outputDir,
  networkCache,
  userAgent,
  concurrency = 12
}) {
  const assetsDir = path.join(outputDir, 'assets');
  const imagesDir = path.join(assetsDir, 'images');
  const fontsDir = path.join(assetsDir, 'fonts');

  await fs.mkdir(imagesDir, { recursive: true });
  await fs.mkdir(fontsDir, { recursive: true });

  const urlMap = new Map();
  const urlsToDownload = new Set();

  const collectUrl = (rawUrl, base = baseUrl) => {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    const trimmed = rawUrl.trim().replace(/^['"]|['"]$/g, '');
    if (
      !trimmed ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('blob:') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('javascript:') ||
      trimmed.startsWith('mailto:')
    ) {
      return null;
    }
    try {
      const resolved = new URL(trimmed, base).href;
      if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
        urlsToDownload.add(resolved);
        return resolved;
      }
    } catch {}
    return null;
  };

  const cssUrlRegex = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  let match;
  while ((match = cssUrlRegex.exec(cssText)) !== null) {
    collectUrl(match[2], baseUrl);
  }

  $('img').each((_, el) => {
    const $el = $(el);
    const currentSrc = $el.attr('data-cloned-current-src');
    const src = currentSrc || $el.attr('src');
    if (src) collectUrl(src);
  });

  $('link[rel*="icon"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) collectUrl(href);
  });

  $('video[poster], video[src], source[src]').each((_, el) => {
    const $el = $(el);
    if ($el.attr('poster')) collectUrl($el.attr('poster'));
    if ($el.attr('src')) collectUrl($el.attr('src'));
  });

  $('image[href], image[xlink\\:href]').each((_, el) => {
    const $el = $(el);
    if ($el.attr('href')) collectUrl($el.attr('href'));
    if ($el.attr('xlink:href')) collectUrl($el.attr('xlink:href'));
  });

  $('[style*="url("]').each((_, el) => {
    const styleStr = $(el).attr('style') || '';
    let styleMatch;
    while ((styleMatch = cssUrlRegex.exec(styleStr)) !== null) {
      collectUrl(styleMatch[2], baseUrl);
    }
  });

  const urlList = Array.from(urlsToDownload);
  let downloadedCount = 0;

  async function downloadSingleUrl(targetUrl) {
    try {
      let buffer = null;
      let contentType = '';

      if (networkCache && networkCache.has(targetUrl)) {
        const cached = networkCache.get(targetUrl);
        buffer = cached.body;
        contentType = cached.contentType || '';
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const res = await fetch(targetUrl, {
            headers: {
              'User-Agent': userAgent,
              Referer: baseUrl,
              Accept: '*/*'
            },
            signal: controller.signal
          });
          if (res.ok) {
            contentType = res.headers.get('content-type') || '';
            if (contentType.includes('text/html')) return;
            const arrayBuf = await res.arrayBuffer();
            buffer = Buffer.from(arrayBuf);
          }
        } finally {
          clearTimeout(timeout);
        }
      }

      if (!buffer || buffer.length === 0) return;

      const filename = sanitizeFilename(targetUrl, contentType);
      const isFont = isFontAsset(filename, contentType);
      const subFolder = isFont ? 'fonts' : 'images';
      const targetPath = path.join(assetsDir, subFolder, filename);

      await fs.writeFile(targetPath, buffer);
      downloadedCount++;

      urlMap.set(targetUrl, {
        htmlRelativePath: `assets/${subFolder}/${filename}`,
        cssRelativePath: `assets/${subFolder}/${filename}`
      });
    } catch {}
  }

  for (let i = 0; i < urlList.length; i += concurrency) {
    const batch = urlList.slice(i, i + concurrency);
    await Promise.all(batch.map(downloadSingleUrl));
  }

  const rewrittenCss = cssText.replace(cssUrlRegex, (fullMatch, quote, rawInnerUrl) => {
    const trimmed = rawInnerUrl.trim();
    if (trimmed.startsWith('data:') || trimmed.startsWith('#')) return fullMatch;
    try {
      const resolved = new URL(trimmed, baseUrl).href;
      const mapped = urlMap.get(resolved);
      if (mapped) {
        return `url("${mapped.cssRelativePath}")`;
      }
      return `url("${resolved}")`;
    } catch {
      return fullMatch;
    }
  });

  $('img').each((_, el) => {
    const $el = $(el);
    const currentSrc = $el.attr('data-cloned-current-src');
    const rawSrc = currentSrc || $el.attr('src');
    $el.removeAttr('data-cloned-current-src');

    if (rawSrc && !rawSrc.startsWith('data:')) {
      try {
        const resolved = new URL(rawSrc, baseUrl).href;
        const mapped = urlMap.get(resolved);
        if (mapped) {
          $el.attr('src', mapped.htmlRelativePath);
          $el.removeAttr('srcset');
          $el.removeAttr('sizes');
        } else {
          $el.attr('src', resolved);
        }
      } catch {}
    }
  });

  $('picture').each((_, pic) => {
    const $pic = $(pic);
    const $img = $pic.find('img');
    const imgSrc = $img.attr('src') || '';
    if (imgSrc.startsWith('assets/')) {
      $pic.find('source').remove();
    }
  });

  $('link[rel*="icon"]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    if (href && !href.startsWith('data:')) {
      try {
        const resolved = new URL(href, baseUrl).href;
        const mapped = urlMap.get(resolved);
        $el.attr('href', mapped ? mapped.htmlRelativePath : resolved);
      } catch {}
    }
  });

  $('video[poster], video[src], source[src]').each((_, el) => {
    const $el = $(el);
    for (const attr of ['poster', 'src']) {
      const val = $el.attr(attr);
      if (val && !val.startsWith('data:')) {
        try {
          const resolved = new URL(val, baseUrl).href;
          const mapped = urlMap.get(resolved);
          $el.attr(attr, mapped ? mapped.htmlRelativePath : resolved);
        } catch {}
      }
    }
  });

  $('[style*="url("]').each((_, el) => {
    const $el = $(el);
    const styleStr = $el.attr('style') || '';
    const updatedStyle = styleStr.replace(cssUrlRegex, (fullMatch, quote, rawInnerUrl) => {
      const trimmed = rawInnerUrl.trim();
      if (trimmed.startsWith('data:') || trimmed.startsWith('#')) return fullMatch;
      try {
        const resolved = new URL(trimmed, baseUrl).href;
        const mapped = urlMap.get(resolved);
        if (mapped) {
          return `url('${mapped.htmlRelativePath}')`;
        }
        return `url('${resolved}')`;
      } catch {
        return fullMatch;
      }
    });
    $el.attr('style', updatedStyle);
  });

  return {
    rewrittenCss,
    downloadedCount,
    totalFound: urlList.length,
    urlMap
  };
}
