import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Full-app tests load the router and lazy pages; under coverage with parallel files the first
// render can take longer than the default 1 s of findBy*/waitFor (same budget as STEP_WAIT).
configure({ asyncUtilTimeout: 5_000 });

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
