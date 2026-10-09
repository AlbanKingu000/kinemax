import type { HealthResponse } from '@kinemax/shared';
import { useEffect, useState } from 'react';
import { fetchHealth } from '../api/health';
import { useMessages } from '../i18n/use-messages';

type HealthState =
  { kind: 'loading' } | { kind: 'ready'; health: HealthResponse } | { kind: 'unreachable' };

export function HomePage() {
  const t = useMessages();
  const [state, setState] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal).then(
      (health) => {
        setState({ kind: 'ready', health });
      },
      () => {
        if (!controller.signal.aborted) setState({ kind: 'unreachable' });
      },
    );
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <main>
      <h1>{t.appName}</h1>
      <section aria-labelledby="system-status-heading">
        <h2 id="system-status-heading">{t.home.statusHeading}</h2>
        <div role="status" aria-live="polite">
          {state.kind === 'loading' && <p>{t.home.checking}</p>}
          {state.kind === 'unreachable' && <p>{t.home.unreachable}</p>}
          {state.kind === 'ready' && (
            <dl>
              <dt>{t.home.api}</dt>
              <dd>{state.health.status === 'ok' ? t.home.apiOk : t.home.apiError}</dd>
              <dt>{t.home.database}</dt>
              <dd>{state.health.db === 'up' ? t.home.dbUp : t.home.dbDown}</dd>
            </dl>
          )}
        </div>
      </section>
    </main>
  );
}
