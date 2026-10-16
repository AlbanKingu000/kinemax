import { ADMIN_PAGE_SIZE } from '@kinemax/shared';
import { useId, useState } from 'react';
import { fetchAudit } from '../api/admin';
import { localDateTime } from '../booking/ticket-format';
import { Button } from '../components/Button/Button';
import { DataTable } from '../components/DataTable/DataTable';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { Input } from '../components/Input/Input';
import { Select } from '../components/Select/Select';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { useAsync } from '../hooks/use-async';
import { useAdminMessages } from '../i18n/admin-messages';
import { formatReleaseDate } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import styles from './AdminPage.module.css';
import { Pager } from './Pager';

// The server reads the date filters in the cinemas' time zone; times are shown in it too.
const TIME_ZONE = 'Europe/Belgrade';

/** /admin/audit: the read-only log of admin changes, filtered by who, type and date. */
export function AuditPage() {
  const a = useAdminMessages().audit;
  const t = useMessages();
  const { locale } = useLocale();
  const ids = { actor: useId(), type: useId(), from: useId(), to: useId() };
  const [actor, setActor] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const filters = {
    ...(actor.trim() ? { actor: actor.trim() } : {}),
    ...(entityType ? { entityType } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    page,
  };
  const state = useAsync(
    (signal) => fetchAudit(filters, signal),
    `audit:${JSON.stringify(filters)}`,
  );
  const [types, setTypes] = useState<string[]>([]);
  if (state.status === 'ready' && state.data.entityTypes.join() !== types.join()) {
    setTypes(state.data.entityTypes);
  }
  const filter = (set: (value: string) => void) => (event: { target: { value: string } }) => {
    set(event.target.value);
    setPage(1);
  };
  const json = (value: unknown) => (value == null ? '—' : JSON.stringify(value, null, 2));

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{a.title}</h1>
      </header>
      <p className={styles.hint}>{a.intro}</p>

      <div className={styles.filters} role="search">
        <div className={styles.filter}>
          <label htmlFor={ids.actor}>{a.actor}</label>
          <Input
            id={ids.actor}
            type="search"
            icon="search"
            value={actor}
            onChange={filter(setActor)}
          />
        </div>
        <div className={styles.filter}>
          <label htmlFor={ids.type}>{a.entityType}</label>
          <Select id={ids.type} value={entityType} onChange={filter(setEntityType)}>
            <option value="">{a.anyType}</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </div>
        <div className={styles.filter}>
          <label htmlFor={ids.from}>{a.from}</label>
          <Input
            id={ids.from}
            type="date"
            value={from}
            max={to || undefined}
            onChange={filter(setFrom)}
          />
        </div>
        <div className={styles.filter}>
          <label htmlFor={ids.to}>{a.to}</label>
          <Input
            id={ids.to}
            type="date"
            value={to}
            min={from || undefined}
            onChange={filter(setTo)}
          />
        </div>
      </div>

      {state.status === 'loading' && (
        <div aria-busy="true">
          <p role="status" className="visually-hidden">
            {t.common.loading}
          </p>
          <Skeleton shape="rect" height="20rem" />
        </div>
      )}
      {state.status === 'error' && (
        <EmptyState
          icon="warning"
          tone="error"
          title={a.loadError}
          action={<Button onClick={state.retry}>{t.common.retry}</Button>}
        />
      )}
      {state.status === 'ready' && state.data.entries.length === 0 && (
        <EmptyState icon="info" title={a.none} />
      )}
      {state.status === 'ready' && state.data.entries.length > 0 && (
        <>
          <DataTable caption={a.title} hideCaption>
            <thead>
              <tr>
                <th scope="col">{a.columns.time}</th>
                <th scope="col">{a.columns.actor}</th>
                <th scope="col">{a.columns.action}</th>
                <th scope="col">{a.columns.entity}</th>
                <th scope="col">{a.columns.changes}</th>
              </tr>
            </thead>
            <tbody>
              {state.data.entries.map((entry) => {
                const when = localDateTime(entry.createdAt, TIME_ZONE);
                return (
                  <tr key={entry.id}>
                    <td>
                      {formatReleaseDate(locale, when.date)} {when.time}
                    </td>
                    <td>
                      {entry.actor ? (
                        <>
                          {entry.actor.name}
                          <span className={styles.sub}>{entry.actor.email}</span>
                        </>
                      ) : (
                        a.system
                      )}
                    </td>
                    <th scope="row">{entry.action}</th>
                    <td>
                      {entry.entityType}
                      <span className={styles.sub}>{entry.entityId}</span>
                    </td>
                    <td>
                      <details>
                        <summary>{a.show}</summary>
                        <p className={styles.sub}>{a.before}</p>
                        <pre className={styles.json}>{json(entry.before)}</pre>
                        <p className={styles.sub}>{a.after}</p>
                        <pre className={styles.json}>{json(entry.after)}</pre>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          <Pager
            page={page}
            pages={Math.max(1, Math.ceil(state.data.total / ADMIN_PAGE_SIZE))}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}
