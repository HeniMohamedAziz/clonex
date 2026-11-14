import http from 'http';
import fs from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { launchBrowser } from './browser-finder.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

export function createStaticServer(rootDir) {
  return http.createServer((req, res) => {
    try {
      const parsedUrl = new URL(req.url, 'http://127.0.0.1');
      let safePath = decodeURIComponent(parsedUrl.pathname);
      if (safePath === '/') safePath = '/index.html';

      const filePath = path.join(rootDir, safePath);
      if (!filePath.startsWith(path.resolve(rootDir))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(500);
      res.end('Server error');
    }
  });
}

export async function verifyCloneFidelity({
  outputDir,
  originalScreenshotPath,
  viewportWidth = 1440,
  viewportHeight = 900,
  onProgress = () => {}
}) {
  const server = createStaticServer(outputDir);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const localUrl = `http://127.0.0.1:${port}/index.html`;

  const cloneScreenshotPath = path.join(outputDir, 'screenshot-clone.png');

  onProgress('Verifying cloned page output...');
  const browser = await launchBrowser(['--font-render-hinting=none']);

  try {
    const context = await browser.newContext({
      viewport: { width: viewportWidth, height: viewportHeight },
      deviceScaleFactor: 2
    });
    const page = await context.newPage();
    await page.goto(localUrl, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForTimeout(800);

    await page.screenshot({
      path: cloneScreenshotPath,
      fullPage: false
    });
  } finally {
    await browser.close();
    server.close();
  }

  let similarityPercent = null;
  try {
    const [origBuf, cloneBuf] = await Promise.all([
      fs.readFile(originalScreenshotPath),
      fs.readFile(cloneScreenshotPath)
    ]);
    const img1 = PNG.sync.read(origBuf);
    const img2 = PNG.sync.read(cloneBuf);

    const width = Math.min(img1.width, img2.width);
    const height = Math.min(img1.height, img2.height);
    let matchingPixels = 0;
    const totalPixels = width * height;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx1 = (img1.width * y + x) << 2;
        const idx2 = (img2.width * y + x) << 2;

        const dr = Math.abs(img1.data[idx1] - img2.data[idx2]);
        const dg = Math.abs(img1.data[idx1 + 1] - img2.data[idx2 + 1]);
        const db = Math.abs(img1.data[idx1 + 2] - img2.data[idx2 + 2]);

        if (dr <= 25 && dg <= 25 && db <= 25) {
          matchingPixels++;
        }
      }
    }

    similarityPercent = Number(((matchingPixels / totalPixels) * 100).toFixed(2));
  } catch {
    similarityPercent = null;
  }

  return {
    cloneScreenshotPath,
    similarityPercent
  };
}
