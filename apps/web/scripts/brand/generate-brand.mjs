// Generates the Kinemax logo files from the approved "KX monogram" concept (variant C).
// Every letter is converted to an outline path taken from Cormorant Garamond (SIL OFL 1.1, see
// src/assets/brand/FONT-LICENSE.md), so no logo file depends on a font being loaded.
//
//   npm run brand:generate -w @kinemax/web     (outlines, SVGs, logo-data.ts, then PNG favicons)
//
// Output: src/assets/brand/*.svg, src/assets/brand/logo-data.ts (paths for the <Logo> component)
// and public/favicon.svg. Deterministic: same input, same output.

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const require = createRequire(import.meta.url);
// fontkit (MIT) reads these TrueType outlines correctly; opentype.js 2.0 mis-parsed the instanced
// Cormorant files (missing stems in K, N, M and A).
const fontkit = require('fontkit');
const webDir = fileURLToPath(new URL('../../', import.meta.url));
const brandDir = join(webDir, 'src/assets/brand');
const publicDir = join(webDir, 'public');

const fontFile = (weight) =>
  require.resolve(
    `@fontsource/cormorant-garamond/files/cormorant-garamond-latin-${String(weight)}-normal.woff`,
  );
const fonts = {
  500: fontkit.openSync(fontFile(500)),
  600: fontkit.openSync(fontFile(600)),
  700: fontkit.openSync(fontFile(700)),
};

export const COLORS = { ivory: '#F3EEE8', crimson: '#B3132F', black: '#0B0A0B', tile: '#1C181B' };

const round = (n) => Math.round(n * 100) / 100;
const num = (n) => {
  const r = round(n);
  return Object.is(r, -0) ? '0' : String(r);
};
const COMMANDS = {
  moveTo: 'M',
  lineTo: 'L',
  quadraticCurveTo: 'Q',
  bezierCurveTo: 'C',
  closePath: 'Z',
};
/** SVG path data with 2 decimals. */
const pathData = (path) =>
  path.commands.map((c) => COMMANDS[c.command] + c.args.map(num).join(' ')).join('');

const glyph = (font, ch) => font.glyphForCodePoint(ch.codePointAt(0));
/** Outline of one character with its origin at (x, baseline), in SVG (y-down) coordinates. */
const glyphPath = (font, ch, x, baseline, size) => {
  const k = size / font.unitsPerEm;
  return glyph(font, ch).path.transform(k, 0, 0, -k, x, baseline);
};
/** Ink bounds of a character set at the origin (baseline y = 0). */
function inkBox(font, ch, size) {
  const b = glyphPath(font, ch, 0, 0, size).bbox;
  return { x1: b.minX, x2: b.maxX, y1: b.minY, y2: b.maxY };
}

/**
 * The KX monogram letters centered on (cx, cy).
 * - overlap: how far (in units of the cap height) the X's ink reaches over the K's ink.
 * - opticalShiftY: cap-height letters with serifs look low when centered geometrically; nudge up.
 */
function monogramLetters({ font, size, cx, cy, overlap, opticalShiftY = 0 }) {
  const k = inkBox(font, 'K', size);
  const x = inkBox(font, 'X', size);
  const capHeight = k.y2 - k.y1;
  // Place the X so its left ink edge sits `overlap * capHeight` left of the K's right ink edge.
  const xOffset = k.x2 - overlap * capHeight - x.x1;
  const left = Math.min(k.x1, x.x1 + xOffset);
  const right = Math.max(k.x2, x.x2 + xOffset);
  const top = Math.min(k.y1, x.y1);
  const bottom = Math.max(k.y2, x.y2);
  const originX = cx - (left + right) / 2;
  const baseline = cy - (top + bottom) / 2 - opticalShiftY * capHeight;
  return {
    k: pathData(glyphPath(font, 'K', originX, baseline, size)),
    x: pathData(glyphPath(font, 'X', originX + xOffset, baseline, size)),
    capHeight,
  };
}

/** "KINEMAX" spread so its ink runs exactly from `left` to `left + width` (like textLength). */
function wordmark({ font, size, left, width, baseline }) {
  const text = 'KINEMAX';
  const scale = size / font.unitsPerEm;
  const { positions } = font.layout(text); // includes kerning
  const letters = [...text];
  const first = inkBox(font, letters[0], size);
  const last = inkBox(font, letters[letters.length - 1], size);
  const advances = positions.map((p) => p.xAdvance * scale);
  const naturalInk = advances.slice(0, -1).reduce((sum, a) => sum + a, 0) + last.x2 - first.x1;
  const gap = (width - naturalInk) / (letters.length - 1);
  let pen = left - first.x1;
  const parts = [];
  letters.forEach((ch, i) => {
    parts.push(pathData(glyphPath(font, ch, pen, baseline, size)));
    pen += (advances[i] ?? 0) + gap;
  });
  return { d: parts.join(''), capHeight: first.y2 - first.y1, tracking: gap / size };
}

function svg({ viewBox, body, title = 'Kinemax' }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="title"><title id="title">${title}</title>${body}</svg>\n`;
}

const ring = ({ cx, cy, r, stroke, opacity = 0.35, color = COLORS.ivory }) =>
  `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" fill="none" stroke="${color}" stroke-opacity="${String(opacity)}" stroke-width="${String(stroke)}"/>`;
const fill = (d, color) => `<path fill="${color}" d="${d}"/>`;
/** Filled path with a same-color hairline stroke: a slight faux-bold for tiny sizes. */
const boldFill = (d, color, width) =>
  `<path fill="${color}" stroke="${color}" stroke-width="${String(width)}" stroke-linejoin="round" d="${d}"/>`;

// ---------------------------------------------------------------------------------------------
// Geometry (approved concept: 360 x 250 canvas, ring r=74 at (180, 86), letters 88 units,
// wordmark 34 units from x=30 over 300 units, baseline 222)
// ---------------------------------------------------------------------------------------------
const OVERLAP = 0.2; // The X reaches 20% of the cap height over the K, as in the concept: deliberate, legible.
const OPTICAL_SHIFT = 0.02; // Serifed caps look low when centered by their bounding box.
const MONO = { font: fonts[600], size: 88, overlap: OVERLAP, opticalShiftY: OPTICAL_SHIFT };

const full = {
  letters: monogramLetters({ ...MONO, cx: 180, cy: 86 }),
  word: wordmark({ font: fonts[500], size: 34, left: 30, width: 300, baseline: 222 }),
};

const monogramGeometry = { cx: 76, cy: 76, r: 74, stroke: 1.5 };
const monogram = monogramLetters({ ...MONO, cx: 76, cy: 76 });

// Horizontal (site header): monogram left, wordmark right, centered on the ring's middle.
const horizontal = (() => {
  const cx = 76;
  const cy = 76;
  const letters = monogramLetters({ ...MONO, cx, cy });
  const size = 56;
  const k = inkBox(fonts[500], 'K', size);
  const width = 420;
  const left = 186;
  const word = wordmark({ font: fonts[500], size, left, width, baseline: cy + (k.y2 - k.y1) / 2 });
  return { letters, word, viewBox: `0 0 ${String(left + width + 4)} 152`, cx, cy };
})();

// Favicons on a #1C181B rounded tile. Large (48 px and up): ring + KX semibold. Small (32 px and
// below): no ring, bold letters, with about a sixth of the tile free around them so KX does not
// touch the rounded edges.
const tileLarge = monogramLetters({ ...MONO, size: 31, cx: 32, cy: 32 });
const tileSmall = monogramLetters({
  font: fonts[700],
  size: 40,
  cx: 32,
  cy: 32,
  overlap: 0.1,
  opticalShiftY: 0.01,
});
const tile = `<rect width="64" height="64" rx="14" fill="${COLORS.tile}"/>`;

const files = {
  'logo-full.svg': svg({
    viewBox: '0 0 360 250',
    body:
      ring({ cx: 180, cy: 86, r: 74, stroke: 1.5 }) +
      fill(full.letters.k + full.word.d, COLORS.ivory) +
      fill(full.letters.x, COLORS.crimson),
  }),
  'logo-horizontal.svg': svg({
    viewBox: horizontal.viewBox,
    body:
      ring({ cx: horizontal.cx, cy: horizontal.cy, r: 74, stroke: 1.5 }) +
      fill(horizontal.letters.k + horizontal.word.d, COLORS.ivory) +
      fill(horizontal.letters.x, COLORS.crimson),
  }),
  'monogram.svg': svg({
    viewBox: '0 0 152 152',
    body:
      ring(monogramGeometry) + fill(monogram.k, COLORS.ivory) + fill(monogram.x, COLORS.crimson),
  }),
  'monogram-on-crimson.svg': svg({
    viewBox: '0 0 152 152',
    body:
      ring({ ...monogramGeometry, opacity: 0.5 }) +
      fill(monogram.k, COLORS.ivory) +
      fill(monogram.x, COLORS.black),
  }),
  'favicon-large.svg': svg({
    viewBox: '0 0 64 64',
    body:
      tile +
      ring({ cx: 32, cy: 32, r: 25, stroke: 1.25, opacity: 0.45 }) +
      fill(tileLarge.k, COLORS.ivory) +
      fill(tileLarge.x, COLORS.crimson),
  }),
  'favicon-small.svg': svg({
    viewBox: '0 0 64 64',
    body:
      tile + boldFill(tileSmall.k, COLORS.ivory, 1.1) + boldFill(tileSmall.x, COLORS.crimson, 1.1),
  }),
};

mkdirSync(brandDir, { recursive: true });
for (const [name, content] of Object.entries(files)) writeFileSync(join(brandDir, name), content);
// Browsers draw the SVG favicon at 16-32 px, so it is the small (ringless, bold) variant.
writeFileSync(join(publicDir, 'favicon.svg'), files['favicon-small.svg']);

// Path data for the inline <Logo> component (same geometry as the files).
const data = {
  full: {
    viewBox: '0 0 360 250',
    ring: { cx: 180, cy: 86, r: 74, stroke: 1.5 },
    ivory: full.letters.k + full.word.d,
    crimson: full.letters.x,
  },
  horizontal: {
    viewBox: horizontal.viewBox,
    ring: { cx: horizontal.cx, cy: horizontal.cy, r: 74, stroke: 1.5 },
    ivory: horizontal.letters.k + horizontal.word.d,
    crimson: horizontal.letters.x,
  },
  monogram: {
    viewBox: '0 0 152 152',
    ring: monogramGeometry,
    ivory: monogram.k,
    crimson: monogram.x,
  },
};
const logoDataPath = join(brandDir, 'logo-data.ts');
const logoData =
  `// Generated by scripts/brand/generate-brand.mjs. Do not edit by hand.\n` +
  `// Outlines from Cormorant Garamond (SIL Open Font License 1.1, see FONT-LICENSE.md).\n\n` +
  `export interface LogoShape {\n  viewBox: string;\n  ring: { cx: number; cy: number; r: number; stroke: number };\n  ivory: string;\n  crimson: string;\n}\n\n` +
  `export const LOGO_SHAPES = ${JSON.stringify(data, null, 2)} as const satisfies Record<string, LogoShape>;\n`;
// Format with the repo's Prettier settings so `npm run lint` stays green after regenerating.
const prettierOptions = (await prettier.resolveConfig(logoDataPath)) ?? {};
writeFileSync(
  logoDataPath,
  await prettier.format(logoData, { ...prettierOptions, filepath: logoDataPath }),
);

console.log(
  'Brand files written:',
  Object.keys(files).join(', '),
  '+ public/favicon.svg + logo-data.ts',
);
console.log(
  `Wordmark tracking: ${(full.word.tracking * 100).toFixed(1)}% of the font size (full), ${(horizontal.word.tracking * 100).toFixed(1)}% (horizontal)`,
);
console.log(
  `Sizes (bytes): ${Object.entries(files)
    .map(([n, c]) => `${n}=${String(c.length)}`)
    .join(', ')}`,
);
