import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';
// Missing in some environments (old browsers, jsdom): then assume full motion.
const supported = () => typeof (window.matchMedia as unknown) === 'function';

function subscribe(onChange: () => void): () => void {
  if (!supported()) return () => undefined;
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => {
    media.removeEventListener('change', onChange);
  };
}

function getSnapshot(): boolean {
  return supported() && window.matchMedia(QUERY).matches;
}

/** True when the user asked the system for less motion. Updates live. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
