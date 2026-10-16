import { movieStatusSchema, type MovieStatus } from '@kinemax/shared';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { fetchAdminMovies } from '../api/admin';
import { Badge } from '../components/Badge/Badge';
import { Button, ButtonLink } from '../components/Button/Button';
import { DataTable } from '../components/DataTable/DataTable';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { Input } from '../components/Input/Input';
import { Select } from '../components/Select/Select';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { useAsync } from '../hooks/use-async';
import { useAdminMessages } from '../i18n/admin-messages';
import { formatReleaseDate, pickText } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import styles from './AdminPage.module.css';

const STATUS_TONE = { NOW_SHOWING: 'success', COMING_SOON: 'info', ARCHIVED: 'neutral' } as const;

/** Every movie (they are global), searchable by title or director and filterable by status. */
export function MoviesPage() {
  const a = useAdminMessages();
  const t = useMessages();
  const { locale } = useLocale();
  const searchId = useId();
  const statusId = useId();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<MovieStatus | ''>('');
  const query = q.trim();
  const state = useAsync(
    (signal) => fetchAdminMovies({ q: query, ...(status ? { status } : {}) }, signal),
    `movies:${query}:${status}`,
  );

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{a.movies.title}</h1>
        <ButtonLink to="/admin/movies/new" icon="plus" size="sm">
          {a.movies.add}
        </ButtonLink>
      </header>

      <div className={styles.filters} role="search">
        <div className={styles.filter}>
          <label htmlFor={searchId}>{a.movies.search}</label>
          <Input
            id={searchId}
            type="search"
            icon="search"
            value={q}
            placeholder={a.movies.searchPlaceholder}
            onChange={(event) => {
              setQ(event.target.value);
            }}
          />
        </div>
        <div className={styles.filter}>
          <label htmlFor={statusId}>{a.movies.status}</label>
          <Select
            id={statusId}
            value={status}
            onChange={(event) => {
              const parsed = movieStatusSchema.safeParse(event.target.value);
              setStatus(parsed.success ? parsed.data : '');
            }}
          >
            <option value="">{a.movies.allStatuses}</option>
            {movieStatusSchema.options.map((value) => (
              <option key={value} value={value}>
                {a.movies.statuses[value]}
              </option>
            ))}
          </Select>
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
          title={a.movies.loadError}
          action={<Button onClick={state.retry}>{t.common.retry}</Button>}
        />
      )}
      {state.status === 'ready' && state.data.length === 0 && (
        <EmptyState icon="film" title={a.movies.empty} />
      )}
      {state.status === 'ready' && state.data.length > 0 && (
        <>
          <p className={styles.count} role="status">
            {a.movies.count(state.data.length)}
          </p>
          <DataTable caption={a.movies.title} hideCaption>
            <thead>
              <tr>
                <th scope="col">{a.movies.columns.poster}</th>
                <th scope="col">{a.movies.columns.title}</th>
                <th scope="col">{a.movies.columns.status}</th>
                <th scope="col" data-align="end">
                  {a.movies.columns.duration}
                </th>
                <th scope="col">{a.movies.columns.release}</th>
                <th scope="col" data-align="end">
                  {a.movies.columns.showtimes}
                </th>
                <th scope="col">
                  <span className="visually-hidden">{a.movies.columns.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((movie) => {
                const title = pickText(locale, movie.titleSq, movie.titleEn);
                return (
                  <tr key={movie.id}>
                    <td>
                      {movie.posterPath ? (
                        <img className={styles.thumb} src={movie.posterPath} alt="" />
                      ) : (
                        <span className={styles.thumb} aria-hidden="true" />
                      )}
                    </td>
                    <th scope="row">
                      <Link to={`/admin/movies/${movie.id}`} className={styles.rowLink}>
                        {title}
                      </Link>
                      <span className={styles.sub}>{movie.director}</span>
                    </th>
                    <td>
                      <Badge tone={STATUS_TONE[movie.status]}>
                        {a.movies.statuses[movie.status]}
                      </Badge>
                    </td>
                    <td data-align="end">{t.movie.duration(movie.durationMinutes)}</td>
                    <td>{formatReleaseDate(locale, movie.releaseDate)}</td>
                    <td data-align="end">{movie.showtimeCount}</td>
                    <td>
                      <ButtonLink
                        to={`/admin/movies/${movie.id}`}
                        variant="ghost"
                        size="sm"
                        icon="edit"
                        aria-label={a.movies.editLabel(title)}
                      >
                        {a.movies.edit}
                      </ButtonLink>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </>
      )}
    </div>
  );
}
