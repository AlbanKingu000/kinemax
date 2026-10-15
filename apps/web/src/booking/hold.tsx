// Shared by the steps after the seat map (tickets, food, payment): the signed-in user's live hold
// for this show and its countdown.
import { currentBookingResponseSchema, type Booking } from '@kinemax/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { apiRequest } from '../api/http';
import { authErrorMessage } from '../auth/auth-errors';
import { Button } from '../components/Button/Button';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { useMessages } from '../i18n/use-messages';
import { formatTimer } from './countdown';
import styles from './hold.module.css';

type State =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; booking: Booking };

/**
 * Loads the user's live hold and renders `children` with it. Without a hold for this show (none,
 * expired, another show) it goes back to the seat map.
 */
export function CurrentHold({
  showtimeId,
  children,
}: {
  showtimeId: string;
  children: (booking: Booking) => ReactNode;
}) {
  const t = useMessages();
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
  return children(state.booking);
}

/** The mm:ss countdown, with spoken warnings at 5 minutes and 1 minute. */
export function HoldTimer({ secondsLeft }: { secondsLeft: number }) {
  const t = useMessages();
  const announcement =
    secondsLeft <= 60
      ? t.tickets.oneMinuteLeft
      : secondsLeft <= 300
        ? t.tickets.fiveMinutesLeft
        : '';
  return (
    <>
      <p className={styles.timer}>
        <span>{t.tickets.timeLeft}</span>{' '}
        <span role="timer" aria-label={t.tickets.timeLeft} className={styles.clock}>
          {formatTimer(secondsLeft)}
        </span>
      </p>
      <p className="visually-hidden" aria-live="assertive">
        {announcement}
      </p>
    </>
  );
}

/** The hold ran out: the seats are free again; back to the map (the selection is kept). */
export function HoldExpired({ showtimeId }: { showtimeId: string }) {
  const t = useMessages();
  const navigate = useNavigate();
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
