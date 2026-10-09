import { describe, expect, it } from 'vitest';
import { defaultLocale, locales, messages } from './messages';

function keyPaths(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'object' && child !== null
      ? keyPaths(child as object, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('messages', () => {
  it('defaults to Albanian', () => {
    expect(defaultLocale).toBe('sq');
  });

  it('has the same keys and no empty strings in every locale', () => {
    const reference = keyPaths(messages.sq).sort();
    for (const locale of locales) {
      expect(keyPaths(messages[locale]).sort()).toEqual(reference);
      const values = JSON.stringify(messages[locale]);
      expect(values).not.toContain('""');
    }
  });
});
