import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { Container } from '../components/Layout/Layout';
import { useMessages } from '../i18n/use-messages';
import { useAuth } from './auth-context';
import { loginPath } from './next-path';

/**
 * Shows `children` only to signed-in users; others go to /login?next=<this page>. This only
 * guides the UI: the API checks the session on every request anyway.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const t = useMessages();
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <Container narrow>
        <div aria-busy="true" style={{ paddingBlock: 'var(--space-12)' }}>
          <p role="status" className="visually-hidden">
            {t.common.loading}
          </p>
          <Skeleton shape="rect" height="16rem" />
        </div>
      </Container>
    );
  }
  if (status === 'anonymous') {
    return <Navigate to={loginPath(`${location.pathname}${location.search}`)} replace />;
  }
  return children;
}
