import { useEffect } from 'react';

/** Sets the document title and meta description for the current page. */
export function usePageMeta(title: string, description: string): void {
  useEffect(() => {
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
