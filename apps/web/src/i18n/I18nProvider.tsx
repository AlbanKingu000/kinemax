import type { ReactNode } from 'react';
import { defaultLocale, messages, type Locale } from './messages';
import { MessagesContext } from './use-messages';

export function I18nProvider({
  locale = defaultLocale,
  children,
}: {
  locale?: Locale;
  children: ReactNode;
}) {
  return <MessagesContext value={messages[locale]}>{children}</MessagesContext>;
}
