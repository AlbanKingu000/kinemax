// WCAG 2.x contrast math plus the list of color pairs the design actually uses. tokens.test.ts
// checks every pair against tokens.css; the styleguide shows the same ratios.

/** Parses `#rgb` or `#rrggbb` into 0-255 channels. */
export function parseHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) throw new Error(`Not a hex color: ${hex}`);
  const digits = match[1].length === 3 ? match[1].replace(/./g, (d) => d + d) : match[1];
  return [0, 2, 4].map((i) => Number.parseInt(digits.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Reads the hex color custom properties (`--color-x: #abc;`) from a CSS source. */
export function readColorTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const match of css.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-f]{3,6})\s*;/gi)) {
    if (match[1] && match[2]) tokens.set(match[1], match[2].toLowerCase());
  }
  return tokens;
}

/** AA minimums: 4.5 for normal text, 3 for large text and for UI parts / focus indicators. */
export const AA_TEXT = 4.5;
export const AA_NON_TEXT = 3;

/** Where a pair is used (translated in the styleguide). */
export type ContrastUse =
  | 'body'
  | 'secondary'
  | 'muted'
  | 'crimsonText'
  | 'status'
  | 'controlBorder'
  | 'focusRing'
  | 'primaryButton'
  | 'deepPanel'
  | 'toast'
  | 'badge'
  | 'seat'
  | 'chart';

export interface ContrastPair {
  foreground: string;
  background: string;
  min: number;
  use: ContrastUse;
}

const PAGE_BACKGROUNDS = ['color-bg', 'color-surface', 'color-elevated'] as const;
const onPageBackgrounds = (foreground: string, min: number, use: ContrastUse): ContrastPair[] =>
  PAGE_BACKGROUNDS.map((background) => ({ foreground, background, min, use }));
const pair = (
  foreground: string,
  background: string,
  use: ContrastUse,
  min = AA_TEXT,
): ContrastPair => ({ foreground, background, min, use });

/** Every foreground/background combination the components use (token names without `--`). */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  ...onPageBackgrounds('color-text', AA_TEXT, 'body'),
  ...onPageBackgrounds('color-text-secondary', AA_TEXT, 'secondary'),
  ...onPageBackgrounds('color-text-muted', AA_TEXT, 'muted'),
  ...onPageBackgrounds('color-crimson-text', AA_TEXT, 'crimsonText'),
  ...onPageBackgrounds('color-success', AA_TEXT, 'status'),
  ...onPageBackgrounds('color-warning', AA_TEXT, 'status'),
  ...onPageBackgrounds('color-error', AA_TEXT, 'status'),
  ...onPageBackgrounds('color-info', AA_TEXT, 'status'),
  ...onPageBackgrounds('color-border-control', AA_NON_TEXT, 'controlBorder'),
  ...onPageBackgrounds('color-focus-ring', AA_NON_TEXT, 'focusRing'),
  pair('color-focus-ring', 'color-crimson', 'focusRing', AA_NON_TEXT),
  pair('color-on-crimson', 'color-crimson', 'primaryButton'),
  pair('color-on-crimson', 'color-crimson-hover', 'primaryButton'),
  pair('color-on-crimson', 'color-crimson-pressed', 'primaryButton'),
  pair('color-on-crimson', 'color-crimson-deep', 'deepPanel'),
  pair('color-success', 'color-success-bg', 'toast'),
  pair('color-warning', 'color-warning-bg', 'toast'),
  pair('color-error', 'color-error-bg', 'toast'),
  pair('color-info', 'color-info-bg', 'toast'),
  pair('color-text', 'color-success-bg', 'toast'),
  pair('color-text', 'color-warning-bg', 'toast'),
  pair('color-text', 'color-error-bg', 'toast'),
  pair('color-text', 'color-info-bg', 'toast'),
  // Age ratings: ivory text with a control-grey outline; 18+ crimson text and outline.
  pair('color-border-control', 'color-badge-bg', 'badge', AA_NON_TEXT),
  pair('color-crimson-text', 'color-badge-bg', 'badge'),
  pair('color-text', 'color-badge-bg', 'badge'),
  // Seat map: a selected seat is ivory with its number in page black.
  pair('color-bg', 'color-text', 'seat'),
  // Seat numbers in ivory on every seat-type color (the same colors are the 3D seat colors).
  pair('color-on-crimson', 'color-seat-standard', 'seat'),
  pair('color-on-crimson', 'color-seat-vip', 'seat'),
  pair('color-on-crimson', 'color-seat-couple', 'seat'),
  // Admin charts: the two series (tickets, food) and the fill bars are graphics (3:1).
  ...onPageBackgrounds('color-chart-1', AA_NON_TEXT, 'chart'),
  ...onPageBackgrounds('color-chart-2', AA_NON_TEXT, 'chart'),
];
