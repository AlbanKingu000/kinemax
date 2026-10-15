// Step "Pagesa" (DEMO): a payment for the server total and two buttons that decide how the demo
// provider answers. SECURITY: no card number, expiry or CVC field exists here or anywhere; the
// card shown is a fixed picture.
import {
  checkoutResponseSchema,
  type Booking,
  type Payment,
  type SeatMapResponse,
} from '@kinemax/shared';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiRequestError, apiRequest } from '../api/http';
import { Button } from '../components/Button/Button';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { formatPrice } from '../i18n/format';
import { pickText } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import { useSecondsLeft } from './countdown';
import { CurrentHold, HoldExpired, HoldTimer } from './hold';
import styles from './PaymentStep.module.css';

export function PaymentStep({ map }: { map: SeatMapResponse }) {
  return (
    <CurrentHold showtimeId={map.showtime.id}>
      {(booking) => <DemoPayment initial={booking} map={map} />}
    </CurrentHold>
  );
}

type Problem = '' | 'declined' | 'totalChanged' | 'ageRequired' | 'error';

function DemoPayment({ initial, map }: { initial: Booking; map: SeatMapResponse }) {
  const t = useMessages();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const showtimeId = map.showtime.id;
  const [booking, setBooking] = useState(initial);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [busy, setBusy] = useState<'' | 'pay' | 'decline'>('');
  const [problem, setProblem] = useState<Problem>('');
  const [gone, setGone] = useState(false);
  const secondsLeft = useSecondsLeft(booking.holdExpiresAt, booking.serverNow);
  const opened = useRef(false);

  /** Opens (or reuses) the payment for the current server total. */
  async function openPayment(): Promise<Payment | null> {
    try {
      const result = await apiRequest(`/api/bookings/${booking.id}/checkout`, {
        method: 'POST',
        schema: checkoutResponseSchema,
      });
      setBooking(result.booking);
      setPayment(result.payment);
      return result.payment;
    } catch (caught) {
      handle(caught);
      return null;
    }
  }

  function handle(caught: unknown) {
    if (caught instanceof ApiRequestError && caught.status === 410) setGone(true);
    else if (caught instanceof ApiRequestError && caught.status === 422) setProblem('ageRequired');
    else if (caught instanceof ApiRequestError && caught.status === 409) setProblem('totalChanged');
    else setProblem('error');
  }

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void openPayment();
    // Once, on arrival: later attempts open a new payment themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function simulate(outcome: 'success' | 'decline') {
    setBusy(outcome === 'success' ? 'pay' : 'decline');
    setProblem('');
    try {
      // A declined (closed) payment is replaced by a new one for the same total.
      const open = payment?.status === 'PENDING' ? payment : await openPayment();
      if (!open) return;
      const result = await apiRequest(`/api/payments/${open.id}/simulate`, {
        method: 'POST',
        body: { outcome },
        schema: checkoutResponseSchema,
      });
      setPayment(result.payment);
      setBooking(result.booking);
      if (result.booking.status === 'CONFIRMED') {
        void navigate(`/booking/${booking.id}/confirmed`, { replace: true });
      } else {
        setProblem('declined');
      }
    } catch (caught) {
      handle(caught);
      // A changed total: the next attempt opens a payment for the new amount.
      if (caught instanceof ApiRequestError && caught.status === 409) setPayment(null);
    } finally {
      setBusy('');
    }
  }

  if (gone || secondsLeft <= 0) return <HoldExpired showtimeId={showtimeId} />;

  const nameOf = (item: { nameSq: string; nameEn: string | null }) =>
    pickText(locale, item.nameSq, item.nameEn);
  const categoryName = (code: string) => {
    const category = booking.categories.find((c) => c.code === code);
    return category ? nameOf(category) : code;
  };

  return (
    <section aria-labelledby="payment-title" className={styles.step}>
      <div className={styles.header}>
        <h2 id="payment-title" className={styles.title}>
          {t.payment.title}
        </h2>
        <HoldTimer secondsLeft={secondsLeft} />
      </div>
      <p className={styles.demo}>
        <strong>{t.payment.demoLabel}</strong>
        <span>{t.payment.demoNote}</span>
      </p>

      <div className={styles.layout}>
        <div className={styles.pay}>
          {/* A picture of a card, never a form: there is nothing to type here. */}
          <div className={styles.card} role="img" aria-label={t.payment.cardLabel}>
            <span className={styles.brand} aria-hidden="true">
              KINEMAX · DEMO
            </span>
            <span className={styles.chip} aria-hidden="true" />
            <span className={styles.number} aria-hidden="true">
              4242 •••• •••• 4242
            </span>
            <span className={styles.holder} aria-hidden="true">
              {t.payment.cardHolder}
            </span>
          </div>
          <div className={styles.buttons}>
            <Button
              size="lg"
              loading={busy === 'pay'}
              disabled={busy !== '' || payment === null}
              onClick={() => void simulate('success')}
            >
              {t.payment.pay} · {formatPrice(locale, payment?.amountCents ?? booking.totalCents)}
            </Button>
            <Button
              variant="secondary"
              loading={busy === 'decline'}
              disabled={busy !== '' || payment === null}
              onClick={() => void simulate('decline')}
            >
              {t.payment.decline}
            </Button>
          </div>
          <p role="status" className={styles.problem} data-tone={problem || undefined}>
            {problem ? t.payment[problem] : ''}
          </p>
        </div>

        <aside className={styles.summary} aria-labelledby="payment-summary-title">
          <h3 id="payment-summary-title" className={styles.summaryTitle}>
            {t.payment.summary}
          </h3>
          {payment === null && problem === '' ? <Skeleton shape="rect" height="6rem" /> : null}
          <ul className={styles.lines}>
            {booking.isWholeHall ? (
              <li>
                <span>{t.ticket.suite}</span>
                <span>{formatPrice(locale, booking.ticketsCents)}</span>
              </li>
            ) : (
              booking.seats.map((seat) => (
                <li key={seat.seatId}>
                  <span>
                    {t.ticket.seatLine(seat.row, seat.number)} ·{' '}
                    {seat.tickets.map((x) => categoryName(x.category)).join(' + ')}
                  </span>
                  <span>{formatPrice(locale, seat.totalCents)}</span>
                </li>
              ))
            )}
            {booking.food.map((line) => (
              <li key={`${line.menuItemId}:${line.fulfillment}`}>
                <span>{t.food.line(line.quantity, nameOf(line))}</span>
                <span>{formatPrice(locale, line.totalCents)}</span>
              </li>
            ))}
          </ul>
          <p className={styles.total}>
            <span>{t.tickets.total}</span>
            <strong>{formatPrice(locale, booking.totalCents)}</strong>
          </p>
          <div className={styles.back}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigate(
                  problem === 'ageRequired'
                    ? `/booking/${showtimeId}/tickets`
                    : `/booking/${showtimeId}/food`,
                );
              }}
            >
              {problem === 'ageRequired' ? t.payment.backToTickets : t.payment.backToFood}
            </Button>
          </div>
        </aside>
      </div>
    </section>
  );
}
