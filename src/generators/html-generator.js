import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import prettier from 'prettier';
import { downloadAndRewriteAssets } from '../asset-downloader.js';

function serializeAttrs(attrsObj = {}) {
  return Object.entries(attrsObj)
    .filter(([k]) => !k.startsWith('data-react') && k !== 'nonce')
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`)
    .join(' ');
}

export async function generateHtmlOutput(captureData, outputDir, options = {}) {
  const { downloadAssets = true, onProgress = () => {} } = options;
  const {
    finalUrl,
    userAgent,
    title,
    htmlAttrs,
    bodyAttrs,
    headHtml,
    bodyHtml,
    fullCss,
    designTokens,
    networkCache
  } = captureData;

  await fs.mkdir(outputDir, { recursive: true });

  const fullDocHtml = `<!DOCTYPE html>
<html ${serializeAttrs(htmlAttrs)}>
<head>${headHtml}</head>
<body ${serializeAttrs(bodyAttrs)}>${bodyHtml}</body>
</html>`;

  const $ = cheerio.load(fullDocHtml, { decodeEntities: false });

  onProgress('Cleaning DOM and resolving links...');

  $('script, noscript').remove();
  $('base').remove();
  $('meta[http-equiv="Content-Security-Policy"]').remove();
  $('meta[http-equiv="refresh"]').remove();
  $('link[rel="preload"], link[rel="modulepreload"], link[rel="prefetch"], link[rel="dns-prefetch"]').remove();

  $('style').remove();
  $('link[rel="stylesheet"], link[as="style"]').remove();

  $('canvas[data-cloned-canvas-src]').each((_, el) => {
    const $canvas = $(el);
    const dataUrl = $canvas.attr('data-cloned-canvas-src');
    const className = $canvas.attr('class') || '';
    const id = $canvas.attr('id') || '';
    const style = $canvas.attr('style') || '';
    const width = $canvas.attr('data-cloned-width') || $canvas.attr('width') || '';
    const height = $canvas.attr('data-cloned-height') || $canvas.attr('height') || '';

    const $img = $('<img>');
    $img.attr('src', dataUrl);
    if (className) $img.attr('class', className);
    if (id) $img.attr('id', id);
    if (style) $img.attr('style', style);
    if (width) $img.attr('width', width);
    if (height) $img.attr('height', height);
    $img.attr('alt', '');

    $canvas.replaceWith($img);
  });

  $('a[href]').each((_, el) => {
    const $a = $(el);
    const href = $a.attr('href');
    if (
      href &&
      !href.startsWith('#') &&
      !href.startsWith('javascript:') &&
      !href.startsWith('mailto:') &&
      !href.startsWith('tel:')
    ) {
      try {
        $a.attr('href', new URL(href, finalUrl).href);
      } catch {}
    }
  });

  $('iframe[src]').each((_, el) => {
    const $iframe = $(el);
    const src = $iframe.attr('src');
    if (src && !src.startsWith('about:') && !src.startsWith('javascript:')) {
      try {
        $iframe.attr('src', new URL(src, finalUrl).href);
      } catch {}
    } else {
      $iframe.remove();
    }
  });

  let processedCss = fullCss;
  let assetStats = { downloadedCount: 0, totalFound: 0 };

  if (downloadAssets) {
    onProgress('Downloading images and fonts...');
    const result = await downloadAndRewriteAssets({
      cssText: fullCss,
      $,
      baseUrl: finalUrl,
      outputDir,
      networkCache,
      userAgent
    });
    processedCss = result.rewrittenCss;
    assetStats = {
      downloadedCount: result.downloadedCount,
      totalFound: result.totalFound
    };
  }

  const finalCss = `${processedCss}\n`;

  if ($('head meta[charset]').length === 0) {
    $('head').prepend('<meta charset="utf-8">');
  }
  if ($('head meta[name="viewport"]').length === 0) {
    $('head').append('<meta name="viewport" content="width=device-width, initial-scale=1">');
  }
  if ($('head title').length === 0) {
    $('head').append(`<title>${title}</title>`);
  }
  $('head').append('<link rel="stylesheet" href="styles.css">');

  const rawOutputHtml = $.html();

  let formattedHtml = rawOutputHtml;
  try {
    formattedHtml = await prettier.format(rawOutputHtml, {
      parser: 'html',
      printWidth: 110,
      tabWidth: 2,
      htmlWhitespaceSensitivity: 'css'
    });
  } catch {
    formattedHtml = rawOutputHtml;
  }

  const cssPath = path.join(outputDir, 'styles.css');
  const htmlPath = path.join(outputDir, 'index.html');
  const singleFilePath = path.join(outputDir, 'single-file.html');
  const tokensPath = path.join(outputDir, 'design-tokens.json');

  await fs.writeFile(cssPath, finalCss, 'utf-8');
  await fs.writeFile(htmlPath, formattedHtml, 'utf-8');
  await fs.writeFile(tokensPath, JSON.stringify(designTokens, null, 2), 'utf-8');

  $('head link[href="styles.css"]').replaceWith(`<style>\n${finalCss}\n</style>`);
  await fs.writeFile(singleFilePath, $.html(), 'utf-8');

  return {
    htmlPath,
    cssPath,
    singleFilePath,
    tokensPath,
    finalCss,
    assetStats,
    cleanedBodyHtml: $('body').html() || '',
    bodyAttrs,
    htmlAttrs,
    title
  };
}
