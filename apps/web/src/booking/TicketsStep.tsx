// Step "Biletat": the seats are held on the server for a few minutes; the buyer picks a ticket
// category per person and sees server-calculated prices.
import {
  bookingResponseSchema,
  currentBookingResponseSchema,
  type Booking,
  type SeatMapResponse,
} from '@kinemax/shared';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { ApiRequestError, apiRequest } from '../api/http';
import { authErrorMessage } from '../auth/auth-errors';
import { Button } from '../components/Button/Button';
import { Checkbox } from '../components/Choice/Checkbox';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { FormField } from '../components/FormField/FormField';
import { Select } from '../components/Select/Select';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { formatPrice } from '../i18n/format';
import { pickText } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import { formatTimer, useSecondsLeft } from './countdown';
import { storeSelection } from './selection';
import styles from './TicketsStep.module.css';

type State =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; booking: Booking };

const ticketKey = (seatId: string, occupant: number) => `${seatId}:${String(occupant)}`;

export function TicketsStep({ map }: { map: SeatMapResponse }) {
  const t = useMessages();
  const showtimeId = map.showtime.id;
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest('/api/bookings/current', {
      schema: currentBookingResponseSchema,
      signal: controller.signal,
    }).then(
      ({ booking }) => {
        setState(
          booking?.showtimeId === showtimeId ? { status: 'ready', booking } : { status: 'none' },
        );
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', error });
      },
    );
    return () => {
      controller.abort();
    };
  }, [showtimeId, attempt]);

  if (state.status === 'loading') {
    return (
      <div aria-busy="true">
        <p role="status" className="visually-hidden">
          {t.common.loading}
        </p>
        <Skeleton shape="rect" height="16rem" />
      </div>
    );
  }
  if (state.status === 'none') return <Navigate to={`/booking/${showtimeId}`} replace />;
  if (state.status === 'error') {
    return (
      <EmptyState
        icon="warning"
        tone="error"
        title={authErrorMessage(t, state.error)}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              setState({ status: 'loading' });
              setAttempt((n) => n + 1);
            }}
          >
            {t.common.retry}
          </Button>
        }
      />
    );
  }
  return <HeldBooking initial={state.booking} map={map} />;
}

function HeldBooking({ initial, map }: { initial: Booking; map: SeatMapResponse }) {
  const t = useMessages();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const showtimeId = map.showtime.id;
  const [booking, setBooking] = useState(initial);
  const [categories, setCategories] = useState(
    () =>
      new Map(
        initial.seats.flatMap((seat) =>
          seat.tickets.map((ticket) => [ticketKey(seat.seatId, ticket.occupant), ticket.category]),
        ),
      ),
  );
  const [ageConfirmed, setAgeConfirmed] = useState(initial.ageRatingConfirmed);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ageError, setAgeError] = useState(false);
  const [notice, setNotice] = useState('');
  const [gone, setGone] = useState(false);
  const latest = useRef(0);
  const secondsLeft = useSecondsLeft(booking.holdExpiresAt, booking.serverNow);
  const expired = gone || secondsLeft <= 0;

  // Keep the seats in the browser, so changing seats or an expired hold starts from them.
  useEffect(() => {
    storeSelection(showtimeId, {
      seatIds: initial.seats.map((s) => s.seatId),
      wholeHall: initial.isWholeHall,
    });
  }, [showtimeId, initial]);

  async function save(next: Map<string, string>, confirmed: boolean) {
    const request = ++latest.current;
    setSaving(true);
    setError('');
    try {
      const result = await apiRequest(`/api/bookings/${booking.id}/tickets`, {
        method: 'PUT',
        body: {
          tickets: [...next].map(([key, category]) => {
            const [seatId = '', occupant = '1'] = key.split(':');
            return { seatId, occupant: Number(occupant), category };
          }),
          ageRatingConfirmed: confirmed,
        },
        schema: bookingResponseSchema,
      });
      if (request === latest.current) setBooking(result.booking);
    } catch (caught) {
      if (caught instanceof ApiRequestError && (caught.status === 410 || caught.status === 409)) {
        setGone(true);
      } else if (request === latest.current) {
        setError(t.tickets.saveError);
      }
    } finally {
      if (request === latest.current) setSaving(false);
    }
  }

  async function changeSeats() {
    try {
      await apiRequest(`/api/bookings/${booking.id}/hold`, { method: 'DELETE' });
    } catch {
      // Already released or expired: the seats are free either way.
    }
    void navigate(`/booking/${showtimeId}`);
  }

  if (expired) {
    return (
      <EmptyState
        icon="clock"
        headingLevel="h2"
        title={t.tickets.expiredTitle}
        action={
          <Button
            onClick={() => {
              void navigate(`/booking/${showtimeId}`);
            }}
          >
            {t.tickets.backToSeats}
          </Button>
        }
      >
        <p>{t.tickets.expiredBody}</p>
      </EmptyState>
    );
  }

  const announcement =
    secondsLeft <= 60
      ? t.tickets.oneMinuteLeft
      : secondsLeft <= 300
        ? t.tickets.fiveMinutesLeft
        : '';
  const typeName = (type: keyof typeof t.seats.types) => t.seats.types[type];

  return (
    <section aria-labelledby="tickets-title" className={styles.step}>
      <div className={styles.header}>
        <h2 id="tickets-title" className={styles.title}>
          {t.tickets.title}
        </h2>
        <p className={styles.timer}>
          <span>{t.tickets.timeLeft}</span>{' '}
          <span role="timer" aria-label={t.tickets.timeLeft} className={styles.clock}>
            {formatTimer(secondsLeft)}
          </span>
        </p>
      </div>
      <p className="visually-hidden" aria-live="assertive">
        {announcement}
      </p>
      <p className={styles.note}>{t.tickets.holdNote}</p>

      {booking.isWholeHall ? (
        <p className={styles.line}>
          <span>{t.tickets.suitePrice}</span>
          <span>{formatPrice(locale, booking.wholeHallPriceCents ?? 0)}</span>
        </p>
      ) : (
        <ul className={styles.seats}>
          {booking.seats.map((seat) => (
            <li key={seat.seatId} className={styles.seat}>
              <p className={styles.seatName}>
                {t.seats.rowSeat(seat.row, seat.number)} · {typeName(seat.type)}
              </p>
              {seat.tickets.map((ticket) => {
                const key = ticketKey(seat.seatId, ticket.occupant);
                const code = categories.get(key) ?? ticket.category;
                const category = booking.categories.find((c) => c.code === code);
                return (
                  <div key={key} className={styles.ticket}>
                    <FormField
                      label={
                        seat.tickets.length > 1
                          ? t.tickets.personCategory(ticket.occupant)
                          : t.tickets.category
                      }
                      hint={
                        category?.descriptionSq
                          ? pickText(locale, category.descriptionSq, category.descriptionEn)
                          : undefined
                      }
                    >
                      {(props) => (
                        <Select
                          {...props}
                          value={code}
                          onChange={(event) => {
                            const next = new Map(categories).set(key, event.target.value);
                            setCategories(next);
                            void save(next, ageConfirmed);
                          }}
                        >
                          {booking.categories.map((c) => (
                            <option key={c.code} value={c.code}>
                              {pickText(locale, c.nameSq, c.nameEn)}
                            </option>
                          ))}
                        </Select>
                      )}
                    </FormField>
                    <span className={styles.price}>{formatPrice(locale, ticket.priceCents)}</span>
                  </div>
                );
              })}
              {seat.surchargeCents > 0 && (
                <p className={styles.line}>
                  <span>{t.tickets.sofaSurcharge}</span>
                  <span>{formatPrice(locale, seat.surchargeCents)}</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className={styles.total} aria-live="polite" aria-busy={saving}>
        <span>{t.tickets.total}</span>
        <strong>{formatPrice(locale, booking.totalCents)}</strong>
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {booking.ageConfirmationRequired && (
        <div className={styles.age}>
          <Checkbox
            label={t.tickets.ageConfirm}
            checked={ageConfirmed}
            aria-invalid={ageError || undefined}
            aria-describedby={ageError ? 'age-error' : undefined}
            onChange={(event) => {
              setAgeConfirmed(event.target.checked);
              setAgeError(false);
              void save(categories, event.target.checked);
            }}
          />
          {ageError && (
            <p id="age-error" className={styles.error}>
              {t.tickets.ageRequired}
            </p>
          )}
        </div>
      )}

      <p role="status" className={styles.notice}>
        {notice}
      </p>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => void changeSeats()}>
          {t.tickets.changeSeats}
        </Button>
        <Button
          disabled={saving}
          onClick={() => {
            if (booking.ageConfirmationRequired && !ageConfirmed) {
              setAgeError(true);
              return;
            }
            setNotice(t.tickets.nextStepSoon);
          }}
        >
          {t.seats.continue}
        </Button>
      </div>
    </section>
  );
}
