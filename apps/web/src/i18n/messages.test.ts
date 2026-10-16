import { describe, expect, it } from 'vitest';
import { defaultLocale, formatReleaseDate, locales, messages, pickText } from './messages';
import { adminMessages } from './admin-messages';
import { styleguideMessages } from './styleguide-messages';

function keyPaths(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'object' && child !== null
      ? keyPaths(child as object, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe.each([
  ['messages', messages],
  ['styleguide messages', styleguideMessages],
  ['admin messages', adminMessages],
] as const)('%s', (_name, catalog) => {
  it('has the same keys and no empty strings in every locale', () => {
    const reference = keyPaths(catalog.sq).sort();
    for (const locale of locales) {
      expect(keyPaths(catalog[locale]).sort()).toEqual(reference);
      expect(JSON.stringify(catalog[locale])).not.toContain('""');
    }
  });
});

describe('messages', () => {
  it('defaults to Albanian', () => {
    expect(defaultLocale).toBe('sq');
  });

  it('formats durations per language', () => {
    expect(messages.sq.movie.duration(112)).toBe('1 orë 52 min');
    expect(messages.en.movie.duration(112)).toBe('1 h 52 min');
    expect(messages.sq.movie.duration(45)).toBe('45 min');
    expect(messages.en.movie.duration(59)).toBe('59 min');
  });

  it('fills in values', () => {
    expect(messages.sq.common.remove('VIP')).toBe('Hiq VIP');
    expect(messages.en.common.remove('VIP')).toBe('Remove VIP');
    expect(styleguideMessages.sq.logo.sizeLabel(16)).toBe('16 px');
    expect(styleguideMessages.en.layout.cell(2)).toBe('Column 2');
  });
});

describe('catalog text helpers', () => {
  it('formats release dates with our own month names', () => {
    expect(formatReleaseDate('sq', '2026-11-13')).toBe('13 nëntor 2026');
    expect(formatReleaseDate('en', '2026-01-04')).toBe('4 January 2026');
  });

  it('picks English when there is an English text, otherwise Albanian', () => {
    expect(pickText('en', 'Shqip', 'English')).toBe('English');
    expect(pickText('en', 'Shqip', null)).toBe('Shqip');
    expect(pickText('sq', 'Shqip', 'English')).toBe('Shqip');
  });
});
