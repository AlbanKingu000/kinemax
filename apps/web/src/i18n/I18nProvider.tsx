import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { readStoredLocale, storeLocale } from './locale-storage';
import { defaultLocale, messages, type Locale } from './messages';
import { LocaleContext, MessagesContext } from './use-messages';

/**
 * Provides the UI language. Starts with `locale` if given, otherwise the remembered choice, otherwise
 * Albanian. Keeps `<html lang>` in sync so screen readers and hyphenation use the right language.
 */
export function I18nProvider({
  locale: initial,
  children,
}: {
  locale?: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(
    () => initial ?? readStoredLocale() ?? defaultLocale,
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const state = useMemo(
    () => ({
      locale,
      setLocale: (next: Locale) => {
        storeLocale(next);
        setLocaleState(next);
      },
    }),
    [locale],
  );

  return (
    <LocaleContext value={state}>
      <MessagesContext value={messages[locale]}>{children}</MessagesContext>
    </LocaleContext>
  );
}
