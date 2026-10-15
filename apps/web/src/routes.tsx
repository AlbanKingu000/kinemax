import type { RouteObject } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/AppShell/AppShell';
import { AccountPage } from './pages/AccountPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { BookingPage } from './pages/BookingPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { HomePage } from './pages/HomePage';
import { MovieDetailPage } from './pages/MovieDetailPage';
import { MyTicketPage } from './pages/MyTicketPage';
import { MyTicketsPage } from './pages/MyTicketsPage';
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
      // Keys: switching between the steps remounts the page, so the seat map is loaded fresh.
      { path: 'booking/:showtimeId', element: <BookingPage key="seats" /> },
      {
        path: 'booking/:showtimeId/tickets',
        element: (
          <RequireAuth>
            <BookingPage key="tickets" step="tickets" />
          </RequireAuth>
        ),
      },
      {
        path: 'booking/:showtimeId/food',
        element: (
          <RequireAuth>
            <BookingPage key="food" step="food" />
          </RequireAuth>
        ),
      },
      {
        path: 'booking/:showtimeId/pay',
        element: (
          <RequireAuth>
            <BookingPage key="pay" step="pay" />
          </RequireAuth>
        ),
      },
      {
        path: 'booking/:bookingId/confirmed',
        element: (
          <RequireAuth>
            <ConfirmationPage />
          </RequireAuth>
        ),
      },
      { path: 'experiences', element: <ComingSoonPage page="experiences" /> },
      { path: 'locations', element: <ComingSoonPage page="locations" /> },
      { path: 'food', element: <ComingSoonPage page="food" /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      {
        path: 'account',
        element: (
          <RequireAuth>
            <AccountPage />
          </RequireAuth>
        ),
      },
      {
        path: 'account/tickets',
        element: (
          <RequireAuth>
            <MyTicketsPage />
          </RequireAuth>
        ),
      },
      {
        path: 'account/tickets/:code',
        element: (
          <RequireAuth>
            <MyTicketPage />
          </RequireAuth>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  ...devRoutes,
];
