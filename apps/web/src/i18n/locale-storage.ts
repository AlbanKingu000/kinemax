import { locales, type Locale } from './messages';

export const LOCALE_STORAGE_KEY = 'kinemax.locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/** The saved language, or undefined. Storage can be blocked (privacy mode, policies): never throw. */
export function readStoredLocale(): Locale | undefined {
  try {
    const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage unavailable: the choice simply is not remembered.
  }
}
