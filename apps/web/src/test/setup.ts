import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom does not implement scrolling; ScrollRestoration calls it on every navigation.
if (typeof window !== 'undefined') window.scrollTo = () => undefined;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // Node-environment tests (scripts/) have no DOM.
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
    document.documentElement.lang = '';
  }
});
