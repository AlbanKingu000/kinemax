import { createContext, useContext } from 'react';
import { defaultLocale, messages, type Locale, type Messages } from './messages';

export const MessagesContext = createContext<Messages>(messages[defaultLocale]);

export interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const LocaleContext = createContext<LocaleState>({
  locale: defaultLocale,
  setLocale: () => undefined,
});

/** Translated UI text for the current locale. */
export function useMessages(): Messages {
  return useContext(MessagesContext);
}

/** The current locale and a setter that remembers the choice. */
export function useLocale(): LocaleState {
  return useContext(LocaleContext);
}
