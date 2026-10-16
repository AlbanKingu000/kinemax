import type { AdminShowtime, AdminShowtimesResponse } from '@kinemax/shared';
import { useId, useState } from 'react';
import { useSearchParams } from 'react-router';
import { activateShowtime, deactivateShowtime, fetchAdminShowtimes } from '../api/admin';
import { localDateTime } from '../booking/ticket-format';
import { Badge } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { ConfirmDialog } from '../components/ConfirmDialog/ConfirmDialog';
import { DataTable } from '../components/DataTable/DataTable';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { Input } from '../components/Input/Input';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { useToast } from '../components/Toast/toast-context';
import { useAsync } from '../hooks/use-async';
import { useAdminMessages } from '../i18n/admin-messages';
import { addDays, formatLongDate, formatPrice, todayIn } from '../i18n/format';
import { formatReleaseDate, pickText } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import { useAdminLocation } from './admin-location';
import styles from './AdminPage.module.css';
import { BulkShowtimesDialog } from './BulkShowtimesDialog';
import { ShowtimeDialog } from './ShowtimeDialog';
import { showtimeErrorMessage } from './showtime-errors';

type Dialog =
  | { kind: 'new' }
  | { kind: 'bulk' }
  | { kind: 'edit'; showtime: AdminShowtime }
  | { kind: 'deactivate'; showtime: AdminShowtime };

/** The day plan of one cinema: every hall's shows, with create, bulk, edit and deactivate. */
export function ShowtimesPage() {
  const s = useAdminMessages().showtimes;
  const t = useMessages();
  const { selected } = useAdminLocation();
  const [params, setParams] = useSearchParams();
  const timeZone = selected?.timeZone ?? 'Europe/Belgrade';
  const today = todayIn(timeZone);
  const requested = params.get('date');
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;
  const state = useAsync(
    (signal) =>
      selected ? fetchAdminShowtimes(selected.id, date, signal) : Promise.reject(new Error('none')),
    `showtimes:${selected?.id ?? ''}:${date}`,
    selected !== null,
  );

  if (!selected) {
    return (
      <EmptyState icon="mapPin" title={s.chooseCinema} headingLevel="h1">
        <p>{s.chooseCinemaBody}</p>
      </EmptyState>
    );
  }
  const setDate = (value: string) => {
    setParams(value === today ? {} : { date: value }, { replace: true });
  };

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{s.title}</h1>
        {state.status === 'ready' && (
          <DayActions day={state.data} date={date} onSaved={state.retry} />
        )}
      </header>
      <DayNav date={date} today={today} onChange={setDate} />
      {state.status === 'loading' && (
        <div aria-busy="true">
          <p role="status" className="visually-hidden">
            {t.common.loading}
          </p>
          <Skeleton shape="rect" height="18rem" />
        </div>
      )}
      {state.status === 'error' && (
        <EmptyState
          icon="warning"
          tone="error"
          title={s.loadError}
          action={<Button onClick={state.retry}>{t.common.retry}</Button>}
        />
      )}
      {state.status === 'ready' && <Day day={state.data} onChanged={state.retry} />}
    </div>
  );
}

function DayNav({
  date,
  today,
  onChange,
}: {
  date: string;
  today: string;
  onChange: (d: string) => void;
}) {
  const s = useAdminMessages().showtimes;
  const t = useMessages();
  const { locale } = useLocale();
  const id = useId();
  return (
    <div className={styles.actions} role="group" aria-label={s.day}>
      <Button
        variant="icon"
        icon="chevronLeft"
        size="sm"
        aria-label={s.previousDay}
        onClick={() => {
          onChange(addDays(date, -1));
        }}
      />
      <label htmlFor={id} className="visually-hidden">
        {s.day}
      </label>
      <Input
        id={id}
        type="date"
        className={styles.dateInput}
        value={date}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
      />
      <Button
        variant="icon"
        icon="chevronRight"
        size="sm"
        aria-label={s.nextDay}
        onClick={() => {
          onChange(addDays(date, 1));
        }}
      />
      <Button
        variant="ghost"
        size="sm"
        disabled={date === today}
        onClick={() => {
          onChange(today);
        }}
      >
        {s.today}
      </Button>
      <p className={styles.hint} aria-live="polite">
        {formatLongDate(locale, t, date)}
      </p>
    </div>
  );
}

/** "Shfaqje e re" and "Shto në grup" with their dialogs. */
function DayActions({
  day,
  date,
  onSaved,
}: {
  day: AdminShowtimesResponse;
  date: string;
  onSaved: () => void;
}) {
  const s = useAdminMessages().showtimes;
  const [open, setOpen] = useState<'new' | 'bulk' | null>(null);
  const done = () => {
    setOpen(null);
    onSaved();
  };
  return (
    <div className={styles.actions}>
      <Button
        size="sm"
        icon="plus"
        onClick={() => {
          setOpen('new');
        }}
      >
        {s.add}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        icon="calendar"
        onClick={() => {
          setOpen('bulk');
        }}
      >
        {s.bulk}
      </Button>
      {open === 'new' && (
        <ShowtimeDialog
          showtime={null}
          date={date}
          day={day}
          onClose={() => {
            setOpen(null);
          }}
          onSaved={done}
        />
      )}
      {open === 'bulk' && (
        <BulkShowtimesDialog
          date={date}
          day={day}
          onClose={() => {
            setOpen(null);
          }}
          onSaved={done}
        />
      )}
    </div>
  );
}

function Day({ day, onChanged }: { day: AdminShowtimesResponse; onChanged: () => void }) {
  const s = useAdminMessages().showtimes;
  const t = useMessages();
  const { locale } = useLocale();
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const time = (iso: string) => localDateTime(iso, day.timeZone).time;
  const title = (show: AdminShowtime) => pickText(locale, show.movieTitleSq, show.movieTitleEn);

  async function deactivate(show: AdminShowtime) {
    setBusy(true);
    setError(undefined);
    try {
      const result = await deactivateShowtime(show.id);
      toast.show({
        tone: 'success',
        title: s.confirm.done(result.refundedBookings, result.cancelledBookings),
      });
      setDialog(null);
      onChanged();
    } catch (err) {
      setError(showtimeErrorMessage(err, s));
    } finally {
      setBusy(false);
    }
  }

  async function activate(show: AdminShowtime) {
    try {
      await activateShowtime(show.id);
      toast.show({ tone: 'success', title: s.confirm.activated });
      onChanged();
    } catch (err) {
      toast.show({ tone: 'error', title: showtimeErrorMessage(err, s) });
    }
  }

  const target = dialog?.kind === 'deactivate' ? dialog.showtime : null;
  return (
    <>
      {day.halls.map((hall) => {
        const shows = day.showtimes.filter((show) => show.hallId === hall.id);
        return (
          <section key={hall.id} className={styles.section} aria-labelledby={`hall-${hall.id}`}>
            <h2 id={`hall-${hall.id}`} className={styles.sectionTitle}>
              {hall.name}{' '}
              <span className={styles.sub}>
                {pickText(locale, hall.hallTypeNameSq, hall.hallTypeNameEn)}
              </span>
            </h2>
            {shows.length === 0 ? (
              <p className={styles.hint}>{s.noShows}</p>
            ) : (
              <DataTable caption={hall.name} hideCaption>
                <thead>
                  <tr>
                    <th scope="col">{s.columns.time}</th>
                    <th scope="col">{s.columns.movie}</th>
                    <th scope="col">{s.columns.version}</th>
                    <th scope="col" data-align="end">
                      {s.columns.tickets}
                    </th>
                    <th scope="col">{s.columns.status}</th>
                    <th scope="col">
                      <span className="visually-hidden">{s.columns.actions}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shows.map((show) => {
                    const start = time(show.startsAt);
                    return (
                      <tr key={show.id} data-muted={show.isActive ? undefined : true}>
                        <td data-align="end">{s.timeRange(start, time(show.endsAt))}</td>
                        <th scope="row">{title(show)}</th>
                        <td>
                          {s.formats[show.format]} ·{' '}
                          {t.movie.languageVersions[show.languageVersion]}
                        </td>
                        <td data-align="end">{show.soldTickets}</td>
                        <td>
                          <Badge
                            tone={show.isPast ? 'neutral' : show.isActive ? 'success' : 'warning'}
                          >
                            {show.isPast
                              ? s.statuses.past
                              : show.isActive
                                ? s.statuses.active
                                : s.statuses.inactive}
                          </Badge>
                        </td>
                        <td>
                          {!show.isPast && (
                            <div className={styles.rowActions}>
                              <Button
                                variant="ghost"
                                size="sm"
                                icon="edit"
                                aria-label={s.editLabel(title(show), start)}
                                onClick={() => {
                                  setDialog({ kind: 'edit', showtime: show });
                                }}
                              >
                                {s.edit}
                              </Button>
                              {show.isActive ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  icon="warning"
                                  aria-label={s.deactivateLabel(title(show), start)}
                                  onClick={() => {
                                    setError(undefined);
                                    setDialog({ kind: 'deactivate', showtime: show });
                                  }}
                                >
                                  {s.deactivate}
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  icon="check"
                                  aria-label={s.activateLabel(title(show), start)}
                                  onClick={() => void activate(show)}
                                >
                                  {s.activate}
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            )}
          </section>
        );
      })}

      {dialog?.kind === 'edit' && (
        <ShowtimeDialog
          showtime={dialog.showtime}
          date={day.date}
          day={day}
          onClose={() => {
            setDialog(null);
          }}
          onSaved={() => {
            setDialog(null);
            onChanged();
          }}
        />
      )}
      <ConfirmDialog
        open={target !== null}
        title={s.confirm.title}
        confirmLabel={s.confirm.yes}
        cancelLabel={s.form.cancel}
        busy={busy}
        {...(error ? { error } : {})}
        onCancel={() => {
          setDialog(null);
        }}
        onConfirm={() => {
          if (target) void deactivate(target);
        }}
      >
        {target && (
          <>
            <p>
              <strong>
                {s.confirm.what(
                  title(target),
                  `${formatReleaseDate(locale, localDateTime(target.startsAt, day.timeZone).date)} ${time(target.startsAt)}`,
                )}
              </strong>
            </p>
            {target.paidBookings > 0 ? (
              <p>
                {s.confirm.refunds(target.soldTickets, formatPrice(locale, target.refundCents))}
              </p>
            ) : (
              <p>{s.confirm.none}</p>
            )}
            {target.activeBookings > target.paidBookings && (
              <p>{s.confirm.holds(target.activeBookings - target.paidBookings)}</p>
            )}
            <p>{s.confirm.removed}</p>
          </>
        )}
      </ConfirmDialog>
    </>
  );
}
