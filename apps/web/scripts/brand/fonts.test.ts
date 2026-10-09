// @vitest-environment node
// The site loads only the latin subset of each variable font (src/styles/fonts.css). Albanian needs
// ë Ë ç Ç; prices need €. Check the real font files, not the unicode-range declaration.
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { openSync } from 'fontkit';

const require = createRequire(import.meta.url);
const FONTS = {
  display:
    '@fontsource-variable/cormorant-garamond/files/cormorant-garamond-latin-wght-normal.woff2',
  body: '@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2',
} as const;
const REQUIRED = ['ë', 'Ë', 'ç', 'Ç', '€', 'À', 'É', '“', '”', '–'];

describe.each(Object.entries(FONTS))('%s font (latin subset)', (_role, specifier) => {
  const path = require.resolve(specifier);

  it('has glyphs for Albanian letters and the euro sign', () => {
    const font = openSync(path);
    const missing = REQUIRED.filter((ch) => !font.hasGlyphForCodePoint(ch.codePointAt(0) ?? 0));
    expect(missing).toEqual([]);
  });

  it('is a variable font covering the weights the design uses', () => {
    const axis = openSync(path).variationAxes.wght;
    expect(axis).toBeDefined();
    expect(axis?.min).toBeLessThanOrEqual(400);
    expect(axis?.max).toBeGreaterThanOrEqual(700);
  });

  it('is referenced by fonts.css', () => {
    const css = readFileSync(new URL('../../src/styles/fonts.css', import.meta.url), 'utf8');
    expect(css).toContain(specifier);
    expect(statSync(path).size).toBeLessThan(45_000);
  });
});
