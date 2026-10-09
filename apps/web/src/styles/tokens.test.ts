import { describe, expect, it } from 'vitest';
import {
  CONTRAST_PAIRS,
  contrastRatio,
  parseHex,
  readColorTokens,
  relativeLuminance,
} from './contrast';
import tokensCss from './tokens.css?raw';

describe('contrast math', () => {
  it('matches the WCAG reference values', () => {
    expect(relativeLuminance('#000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBe(1);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#fff', '#fff')).toBe(1);
  });

  it('parses short and long hex and rejects anything else', () => {
    expect(parseHex('#abc')).toEqual([170, 187, 204]);
    expect(parseHex('#B3132F')).toEqual([179, 19, 47]);
    expect(() => parseHex('red')).toThrow('Not a hex color');
  });
});

describe('design tokens', () => {
  const tokens = readColorTokens(tokensCss);

  it('keeps the brand palette', () => {
    expect(tokens.get('color-bg')).toBe('#0b0a0b');
    expect(tokens.get('color-surface')).toBe('#131113');
    expect(tokens.get('color-elevated')).toBe('#1c181b');
    expect(tokens.get('color-text')).toBe('#f3eee8');
    expect(tokens.get('color-crimson')).toBe('#b3132f');
    expect(tokens.get('color-crimson-deep')).toBe('#8e1023');
  });

  it.each([
    ['rgb-black', 'color-bg'],
    ['rgb-ivory', 'color-text'],
    ['rgb-crimson', 'color-crimson'],
    ['rgb-crimson-deep', 'color-crimson-deep'],
  ])('--%s matches --%s', (channels, color) => {
    const value = new RegExp(`--${channels}:\\s*([\\d ]+);`).exec(tokensCss)?.[1];
    expect(value?.split(' ').map(Number)).toEqual(parseHex(tokens.get(color) ?? ''));
  });

  it.each(CONTRAST_PAIRS.map((pair) => [pair.foreground, pair.background, pair] as const))(
    '%s on %s meets WCAG AA',
    (_fg, _bg, pair) => {
      const foreground = tokens.get(pair.foreground);
      const background = tokens.get(pair.background);
      expect(foreground, `--${pair.foreground} is defined`).toBeDefined();
      expect(background, `--${pair.background} is defined`).toBeDefined();
      expect(contrastRatio(foreground ?? '', background ?? '')).toBeGreaterThanOrEqual(pair.min);
    },
  );
});
