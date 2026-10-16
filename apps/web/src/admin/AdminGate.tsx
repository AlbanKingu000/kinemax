import { lazy, Suspense } from 'react';
import { useAuth } from '../auth/auth-context';
import { isStaff } from '../auth/helpers';
import { AppShell } from '../components/AppShell/AppShell';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { useMessages } from '../i18n/use-messages';
import { NotFoundPage } from '../pages/NotFoundPage';

// Loaded for staff only: visitors and customers never download the admin code.
const AdminApp = lazy(() => import('./AdminApp'));

function Loading() {
  const t = useMessages();
  return (
    <div aria-busy="true" style={{ padding: 'var(--space-8)' }}>
      <p role="status" className="visually-hidden">
        {t.common.loading}
      </p>
      <Skeleton shape="rect" height="16rem" />
    </div>
  );
}

/**
 * /admin/*: the admin panel for SUPER_ADMIN and LOCATION_MANAGER. Everybody else (signed out
 * too) gets the ordinary not-found page, so nothing hints that the panel exists. This only guides
 * the UI: the API checks the role and the cinema on every request.
 */
export function AdminGate() {
  const { status, user } = useAuth();
  if (status === 'loading') return <Loading />;
  if (!isStaff(user)) {
    return (
      <AppShell>
        <NotFoundPage />
      </AppShell>
    );
  }
  return (
    <Suspense fallback={<Loading />}>
      <AdminApp />
    </Suspense>
  );
}
