import { launchBrowser, navigateSafely } from './browser-finder.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function resolveCssUrls(cssText, sheetBaseUrl) {
  if (!cssText || !sheetBaseUrl) return cssText;
  return cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (fullMatch, quote, rawUrl) => {
    const trimmed = rawUrl.trim();
    if (
      !trimmed ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('blob:')
    ) {
      return fullMatch;
    }
    try {
      const resolved = new URL(trimmed, sheetBaseUrl).href;
      return `url("${resolved}")`;
    } catch {
      return fullMatch;
    }
  });
}

export async function captureWebpage(targetUrl, options = {}) {
  const {
    viewportWidth = 1440,
    viewportHeight = 900,
    waitExtraMs = 1500,
    fullScroll = true,
    screenshotPath = null,
    browser: sharedBrowser = null,
    onProgress = () => {}
  } = options;

  const ownsBrowser = !sharedBrowser;
  if (ownsBrowser) onProgress('Launching browser...');
  const browser =
    sharedBrowser ||
    (await launchBrowser(
      [
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--font-render-hinting=none'
      ],
      targetUrl
    ));

  let context = null;
  try {
    context = await browser.newContext({
      viewport: { width: viewportWidth, height: viewportHeight },
      deviceScaleFactor: 2,
      userAgent: USER_AGENT,
      bypassCSP: true,
      ignoreHTTPSErrors: true
    });

    const page = await context.newPage();

    const networkCache = new Map();
    const stylesheetTextCache = new Map();

    page.on('response', async (response) => {
      try {
        const url = response.url();
        const status = response.status();
        if (status < 200 || status >= 300) return;

        const contentType = (response.headers()['content-type'] || '').toLowerCase();
        const resourceType = response.request().resourceType();

        if (resourceType === 'stylesheet' || contentType.includes('text/css') || url.endsWith('.css')) {
          const text = await response.text();
          stylesheetTextCache.set(url, text);
        } else if (
          resourceType === 'image' ||
          resourceType === 'font' ||
          contentType.includes('image/') ||
          contentType.includes('font/')
        ) {
          const body = await response.body();
          networkCache.set(url, { body, contentType });
        }
      } catch {}
    });

    onProgress(`Loading ${targetUrl}...`);
    await navigateSafely(page, targetUrl, 35000);

    const finalUrl = page.url();

    if (fullScroll) {
      onProgress('Scrolling page to load lazy assets...');
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 650;
          const maxScroll = Math.min(document.body.scrollHeight || 10000, 25000);
          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= maxScroll) {
              clearInterval(timer);
              window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
              resolve();
            }
          }, 90);
        });
      });

      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    }

    await page.evaluate(() => document.fonts?.ready).catch(() => {});

    if (waitExtraMs > 0) {
      await page.waitForTimeout(waitExtraMs);
    }

    if (screenshotPath) {
      onProgress('Taking reference screenshot...');
      await page.screenshot({
        path: screenshotPath,
        fullPage: false
      });
    }

    onProgress('Extracting DOM, styles, and design tokens...');

    const extraction = await page.evaluate(() => {
      const canvases = document.querySelectorAll('canvas');
      canvases.forEach((canvas) => {
        try {
          const dataUrl = canvas.toDataURL('image/png');
          if (dataUrl && dataUrl.length > 100) {
            canvas.setAttribute('data-cloned-canvas-src', dataUrl);
            const rect = canvas.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              canvas.setAttribute('data-cloned-width', Math.round(rect.width));
              canvas.setAttribute('data-cloned-height', Math.round(rect.height));
            }
          }
        } catch {}
      });

      const images = document.querySelectorAll('img');
      images.forEach((img) => {
        const lazySrc =
          img.getAttribute('data-src') ||
          img.getAttribute('data-lazy-src') ||
          img.getAttribute('data-original');
        if (img.currentSrc && !img.currentSrc.startsWith('data:image/gif')) {
          img.setAttribute('data-cloned-current-src', img.currentSrc);
        } else if (lazySrc) {
          img.setAttribute('data-cloned-current-src', lazySrc);
        }
        img.removeAttribute('loading');
        img.removeAttribute('decoding');
      });

      document.querySelectorAll('input, textarea, select').forEach((input) => {
        if (input.tagName === 'INPUT') {
          if (input.type === 'checkbox' || input.type === 'radio') {
            if (input.checked) input.setAttribute('checked', 'checked');
            else input.removeAttribute('checked');
          } else if (input.type !== 'password') {
            input.setAttribute('value', input.value || '');
          }
        } else if (input.tagName === 'TEXTAREA') {
          input.textContent = input.value || '';
        }
      });

      document.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot && el.children.length === 0) {
          try {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = el.shadowRoot.innerHTML;
            el.appendChild(wrapper);
          } catch {}
        }
      });

      const sheets = [];
      for (let i = 0; i < document.styleSheets.length; i++) {
        const sheet = document.styleSheets[i];
        if (sheet.disabled) continue;

        const mediaText = sheet.media && sheet.media.mediaText ? sheet.media.mediaText : '';
        const href = sheet.href || null;

        try {
          const rules = Array.from(sheet.cssRules || []);
          const cssText = rules.map((r) => r.cssText).join('\n');
          sheets.push({
            href,
            mediaText,
            cssText,
            accessible: true
          });
        } catch {
          sheets.push({
            href,
            mediaText,
            cssText: null,
            accessible: false
          });
        }
      }

      const cssVariables = {};
      try {
        const rootStyle = getComputedStyle(document.documentElement);
        for (let i = 0; i < rootStyle.length; i++) {
          const prop = rootStyle[i];
          if (prop.startsWith('--')) {
            cssVariables[prop] = rootStyle.getPropertyValue(prop).trim();
          }
        }
      } catch {}

      const colorCounts = {};
      const fontFamilies = new Set();
      const fontSizes = new Set();
      const borderRadii = new Set();

      const sampleElements = Array.from(document.querySelectorAll('body, body *')).slice(0, 800);
      sampleElements.forEach((el) => {
        try {
          const cs = getComputedStyle(el);
          [cs.color, cs.backgroundColor, cs.borderColor].forEach((c) => {
            if (
              c &&
              c !== 'rgba(0, 0, 0, 0)' &&
              c !== 'transparent' &&
              c !== 'rgb(0, 0, 0)'
            ) {
              colorCounts[c] = (colorCounts[c] || 0) + 1;
            }
          });
          if (cs.fontFamily) {
            fontFamilies.add(cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim());
          }
          if (cs.fontSize) fontSizes.add(cs.fontSize);
          if (cs.borderRadius && cs.borderRadius !== '0px') borderRadii.add(cs.borderRadius);
        } catch {}
      });

      const topColors = Object.entries(colorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([color, count]) => ({ color, count }));

      return {
        title: document.title || 'Cloned Page',
        htmlAttrs: Array.from(document.documentElement.attributes).reduce((acc, attr) => {
          acc[attr.name] = attr.value;
          return acc;
        }, {}),
        bodyAttrs: Array.from(document.body.attributes).reduce((acc, attr) => {
          acc[attr.name] = attr.value;
          return acc;
        }, {}),
        headHtml: document.head.innerHTML,
        bodyHtml: document.body.innerHTML,
        sheets,
        designTokens: {
          url: window.location.href,
          capturedAt: new Date().toISOString(),
          colors: topColors,
          fontFamilies: Array.from(fontFamilies).filter(Boolean),
          fontSizes: Array.from(fontSizes),
          borderRadii: Array.from(borderRadii).slice(0, 12),
          cssVariables
        }
      };
    });

    const combinedCssChunks = [];
    for (const sheet of extraction.sheets) {
      let rawCss = sheet.cssText;
      const sheetBase = sheet.href || finalUrl;

      if (!sheet.accessible && sheet.href) {
        if (stylesheetTextCache.has(sheet.href)) {
          rawCss = stylesheetTextCache.get(sheet.href);
        } else {
          try {
            const res = await fetch(sheet.href, {
              headers: { 'User-Agent': USER_AGENT, Referer: finalUrl }
            });
            if (res.ok) {
              rawCss = await res.text();
            }
          } catch {}
        }
      }

      if (rawCss && rawCss.trim()) {
        let resolvedCss = resolveCssUrls(rawCss, sheetBase);
        if (sheet.mediaText && sheet.mediaText.trim() && sheet.mediaText !== 'all') {
          resolvedCss = `@media ${sheet.mediaText} {\n${resolvedCss}\n}`;
        }
        combinedCssChunks.push(resolvedCss);
      }
    }

    let fullCss = combinedCssChunks.join('\n\n');

    const importRegex = /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)\s*([^;]*);/gi;
    const importMatches = Array.from(fullCss.matchAll(importRegex));
    for (const match of importMatches) {
      const rawImportUrl = match[2] || match[4];
      if (!rawImportUrl) continue;
      try {
        const resolvedImportUrl = new URL(rawImportUrl, finalUrl).href;
        let importedCss = stylesheetTextCache.get(resolvedImportUrl);
        if (!importedCss) {
          const res = await fetch(resolvedImportUrl, {
            headers: { 'User-Agent': USER_AGENT, Referer: finalUrl }
          });
          if (res.ok) {
            importedCss = await res.text();
          }
        }
        if (importedCss) {
          const resolvedInner = resolveCssUrls(importedCss, resolvedImportUrl);
          fullCss = fullCss.replace(match[0], resolvedInner);
        }
      } catch {}
    }

    return {
      finalUrl,
      userAgent: USER_AGENT,
      title: extraction.title,
      htmlAttrs: extraction.htmlAttrs,
      bodyAttrs: extraction.bodyAttrs,
      headHtml: extraction.headHtml,
      bodyHtml: extraction.bodyHtml,
      fullCss,
      designTokens: extraction.designTokens,
      networkCache
    };
  } finally {
    if (context) await context.close().catch(() => {});
    if (ownsBrowser) await browser.close().catch(() => {});
  }
}
