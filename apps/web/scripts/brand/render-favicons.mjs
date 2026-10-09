// Renders the PNG favicons from the generated favicon SVGs with Playwright's Chromium (already a
// dev dependency, so no image library is needed). Run after generate-brand.mjs.
//
//   16/32 px: small variant (no ring, bold letters)    48 px: large variant (ring)
//   apple-touch-icon 180 px: large variant on an opaque full square (iOS rounds the corners itself)

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const webDir = fileURLToPath(new URL('../../', import.meta.url));
const brandDir = join(webDir, 'src/assets/brand');
const publicDir = join(webDir, 'public');

const small = readFileSync(join(brandDir, 'favicon-small.svg'), 'utf8');
const large = readFileSync(join(brandDir, 'favicon-large.svg'), 'utf8');
const opaqueSquare = large.replace('rx="14"', 'rx="0"');

const targets = [
  { file: 'favicon-16.png', svg: small, size: 16 },
  { file: 'favicon-32.png', svg: small, size: 32 },
  { file: 'favicon-48.png', svg: large, size: 48 },
  { file: 'apple-touch-icon.png', svg: opaqueSquare, size: 180 },
];

const browser = await chromium.launch();
try {
  for (const { file, svg, size } of targets) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    const sized = svg.replace('<svg ', `<svg width="${String(size)}" height="${String(size)}" `);
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${sized}`,
    );
    await page.screenshot({ path: join(publicDir, file), omitBackground: true });
    await page.close();
    console.log('wrote public/' + file);
  }
} finally {
  await browser.close();
}
