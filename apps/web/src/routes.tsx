import type { RouteObject } from 'react-router';
import { AppShell } from './components/AppShell/AppShell';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { BookingPage } from './pages/BookingPage';
import { HomePage } from './pages/HomePage';
import { MovieDetailPage } from './pages/MovieDetailPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SchedulePage } from './pages/SchedulePage';

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

// Paths are English and language-neutral; the UI language comes from the SQ/EN switch.
export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'movies', element: <ComingSoonPage page="movies" /> },
      { path: 'movies/:slug', element: <MovieDetailPage /> },
      { path: 'schedule', element: <SchedulePage /> },
      { path: 'booking/:showtimeId', element: <BookingPage /> },
      { path: 'experiences', element: <ComingSoonPage page="experiences" /> },
      { path: 'locations', element: <ComingSoonPage page="locations" /> },
      { path: 'food', element: <ComingSoonPage page="food" /> },
      { path: 'login', element: <ComingSoonPage page="login" /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  ...devRoutes,
];
