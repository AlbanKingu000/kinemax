import { useState, type ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { fetchAdminLocations } from '../api/admin';
import { useAuth } from '../auth/auth-context';
import { Button, ButtonLink } from '../components/Button/Button';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { useMessages } from '../i18n/use-messages';
import { useAsync } from '../hooks/use-async';
import { useAdminMessages } from '../i18n/admin-messages';
import {
  AdminLocationContext,
  initialAdminLocation,
  readAdminLocation,
  storeAdminLocation,
} from './admin-location';
import { AdminLayout } from './AdminLayout';
import { DashboardPage } from './DashboardPage';
import { FoodPage } from './FoodPage';
import { HallEditorPage } from './HallEditorPage';
import { HallsPage } from './HallsPage';
import { MovieEditPage } from './MovieEditPage';
import { MoviesPage } from './MoviesPage';
import { PricesPage } from './PricesPage';
import { ScanPage } from './ScanPage';
import { ShowtimesPage } from './ShowtimesPage';

/** Loads the cinemas the user may manage and keeps the switcher's choice. */
function AdminLocationProvider({ children }: { children: ReactNode }) {
  const t = useMessages();
  const a = useAdminMessages();
  const { user } = useAuth();
  const canSelectAll = user?.role === 'SUPER_ADMIN';
  const state = useAsync(fetchAdminLocations, `admin-locations:${user?.id ?? ''}`);
  const [chosen, setChosen] = useState<{ id: string | null } | undefined>(undefined);

  if (state.status === 'loading') return null;
  if (state.status === 'error') {
    return (
      <EmptyState
        icon="warning"
        tone="error"
        title={a.shell.loadError}
        headingLevel="h1"
        action={<Button onClick={state.retry}>{t.common.retry}</Button>}
      />
    );
  }
  const locations = state.data;
  const selectedId =
    chosen && (chosen.id === null ? canSelectAll : locations.some((l) => l.id === chosen.id))
      ? chosen.id
      : initialAdminLocation(locations, canSelectAll, readAdminLocation());
  const value = {
    locations,
    selectedId,
    selected: locations.find((l) => l.id === selectedId) ?? null,
    canSelectAll,
    select: (id: string | null) => {
      storeAdminLocation(id);
      setChosen({ id });
    },
  };
  return <AdminLocationContext value={value}>{children}</AdminLocationContext>;
}

function AdminNotFound() {
  const a = useAdminMessages();
  return (
    <EmptyState
      icon="search"
      eyebrow="404"
      title={a.notFound.title}
      headingLevel="h1"
      action={
        <ButtonLink to="/admin" variant="secondary">
          {a.notFound.back}
        </ButtonLink>
      }
    >
      <p>{a.notFound.body}</p>
    </EmptyState>
  );
}

/** The admin panel (lazy chunk): cinema context, frame and pages. */
export default function AdminApp() {
  const { user } = useAuth();
  const superAdmin = user?.role === 'SUPER_ADMIN';
  return (
    <AdminLocationProvider>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          {superAdmin && (
            <>
              <Route path="movies" element={<MoviesPage />} />
              <Route path="movies/new" element={<MovieEditPage />} />
              <Route path="movies/:id" element={<MovieEditPage />} />
              <Route path="prices" element={<PricesPage />} />
            </>
          )}
          <Route path="showtimes" element={<ShowtimesPage />} />
          <Route path="food" element={<FoodPage />} />
          <Route path="scan" element={<ScanPage />} />
          <Route path="halls" element={<HallsPage />} />
          <Route path="halls/:id" element={<HallEditorPage />} />
          <Route path="*" element={<AdminNotFound />} />
        </Route>
      </Routes>
    </AdminLocationProvider>
  );
}
