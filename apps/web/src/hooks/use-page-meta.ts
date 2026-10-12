import { useEffect } from 'react';

/**
 * Sets the document title and meta description for the current page. `null` leaves them alone
 * (e.g. while a nested not-found page sets its own).
 */
export function usePageMeta(title: string | null, description: string): void {
  useEffect(() => {
    if (title === null) return;
    document.title = title;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.append(meta);
    }
    meta.content = description;
  }, [title, description]);
}
