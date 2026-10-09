import { createContext, useContext } from 'react';
import { defaultLocale, messages, type Messages } from './messages';

export const MessagesContext = createContext<Messages>(messages[defaultLocale]);

/** Translated UI text for the current locale. */
export function useMessages(): Messages {
  return useContext(MessagesContext);
}
