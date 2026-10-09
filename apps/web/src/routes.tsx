import type { RouteObject } from 'react-router';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';

// The styleguide exists in development builds only. In production `import.meta.env.DEV` is the
// constant `false`, so this branch and its lazy chunk are dropped from the bundle and /styleguide
// falls through to the not-found page.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/styleguide',
        lazy: async () => ({ Component: (await import('./pages/StyleguidePage')).StyleguidePage }),
        // Shown while the lazy chunk loads on a first visit straight to this URL.
        hydrateFallbackElement: <></>,
      },
    ]
  : [];

export const routes: RouteObject[] = [
  { path: '/', element: <HomePage /> },
  ...devRoutes,
  { path: '*', element: <NotFoundPage /> },
];
