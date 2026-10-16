import { fetchAdminHalls } from '../api/admin';
import { Badge } from '../components/Badge/Badge';
import { Button, ButtonLink } from '../components/Button/Button';
import { DataTable } from '../components/DataTable/DataTable';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { useAsync } from '../hooks/use-async';
import { useAdminMessages } from '../i18n/admin-messages';
import { pickText } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import { useAdminLocation } from './admin-location';
import styles from './AdminPage.module.css';

/** The halls of the chosen cinema, each with a link to its seat editor. */
export function HallsPage() {
  const a = useAdminMessages();
  const h = a.halls;
  const t = useMessages();
  const { locale } = useLocale();
  const { selected } = useAdminLocation();
  const state = useAsync(
    (signal) =>
      selected ? fetchAdminHalls(selected.id, signal) : Promise.reject(new Error('none')),
    `halls:${selected?.id ?? ''}`,
    selected !== null,
  );

  if (!selected) {
    return (
      <EmptyState icon="mapPin" title={a.showtimes.chooseCinema} headingLevel="h1">
        <p>{a.showtimes.chooseCinemaBody}</p>
      </EmptyState>
    );
  }
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{h.title}</h1>
      </header>
      {state.status === 'loading' && (
        <div aria-busy="true">
          <p role="status" className="visually-hidden">
            {t.common.loading}
          </p>
          <Skeleton shape="rect" height="14rem" />
        </div>
      )}
      {state.status === 'error' && (
        <EmptyState
          icon="warning"
          tone="error"
          title={h.loadError}
          action={<Button onClick={state.retry}>{t.common.retry}</Button>}
        />
      )}
      {state.status === 'ready' && (
        <DataTable caption={h.title} hideCaption>
          <thead>
            <tr>
              <th scope="col">{h.columns.name}</th>
              <th scope="col">{h.columns.type}</th>
              <th scope="col" data-align="end">
                {h.columns.seats}
              </th>
              <th scope="col">{h.columns.status}</th>
              <th scope="col">
                <span className="visually-hidden">{a.movies.columns.actions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((hall) => (
              <tr key={hall.id}>
                <th scope="row">{hall.name}</th>
                <td>
                  {pickText(locale, hall.hallTypeNameSq, hall.hallTypeNameEn)}
                  {hall.wholeHallOnly && <span className={styles.sub}>{h.suite}</span>}
                </td>
                <td data-align="end">{h.seats(hall.activeSeats, hall.inactiveSeats)}</td>
                <td>
                  <Badge tone={hall.isActive ? 'success' : 'warning'}>
                    {hall.isActive ? h.active : h.inactive}
                  </Badge>
                </td>
                <td>
                  <ButtonLink
                    to={`/admin/halls/${hall.id}`}
                    variant="ghost"
                    size="sm"
                    icon="seat"
                    aria-label={h.editLabel(hall.name)}
                  >
                    {h.edit}
                  </ButtonLink>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
