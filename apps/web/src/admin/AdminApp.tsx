import { useState, type ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { fetchAdminLocations } from '../api/admin';
import { useAuth } from '../auth/auth-context';
import { Button, ButtonLink } from '../components/Button/Button';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { useMessages } from '../i18n/use-messages';
import { useAsync } from '../hooks/use-async';
import { useAdminMessages, type AdminMessages } from '../i18n/admin-messages';
import {
  AdminLocationContext,
  initialAdminLocation,
  readAdminLocation,
  storeAdminLocation,
} from './admin-location';
import { AdminLayout } from './AdminLayout';

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

/** A section of the panel that a later part of the task builds. */
export function AdminPlaceholder({ section }: { section: keyof AdminMessages['nav'] }) {
  const a = useAdminMessages();
  return (
    <EmptyState icon="info" title={a.placeholder.title(a.nav[section])} headingLevel="h1">
      <p>{a.placeholder.body}</p>
    </EmptyState>
  );
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
          <Route index element={<AdminPlaceholder section="dashboard" />} />
          {superAdmin && <Route path="movies" element={<AdminPlaceholder section="movies" />} />}
          <Route path="showtimes" element={<AdminPlaceholder section="showtimes" />} />
          <Route path="halls" element={<AdminPlaceholder section="halls" />} />
          <Route path="*" element={<AdminNotFound />} />
        </Route>
      </Routes>
    </AdminLocationProvider>
  );
}
