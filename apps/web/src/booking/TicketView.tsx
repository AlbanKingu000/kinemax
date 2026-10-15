// A booking shown as a ticket: the show, the seats and food, the total, the booking code and a QR
// code that contains only "KINEMAX:<code>". Used by the confirmation page and "Biletat e mia".
import { ticketQrValue, type Ticket } from '@kinemax/shared';
import { QRCodeSVG } from 'qrcode.react';
import type { ReactNode } from 'react';
import { AgeBadge, Badge } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { formatLongDate, formatPrice } from '../i18n/format';
import { pickText } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import { groupCode } from './ticket-format';
import { downloadCalendarEvent } from './ics';
import styles from './TicketView.module.css';

export function TicketView({
  ticket,
  qrSize = 176,
  qrNote,
  actions,
}: {
  ticket: Ticket;
  /** Pixels; larger on the "Biletat e mia" detail for scanning at the entrance. */
  qrSize?: number;
  /** A hint under the QR code (e.g. turn up the brightness). */
  qrNote?: ReactNode;
  /** Extra actions under the calendar button (links, cancellation). */
  actions?: ReactNode;
}) {
  const t = useMessages();
  const { locale } = useLocale();
  const title = pickText(locale, ticket.movie.titleSq, ticket.movie.titleEn);
  const hallType = pickText(locale, ticket.hall.hallTypeNameSq, ticket.hall.hallTypeNameEn);
  const when = `${formatLongDate(locale, t, ticket.localDate)} · ${ticket.localTime}`;
  const valid = ticket.status === 'CONFIRMED';
  const categoryName = (code: string) => {
    const category = ticket.categories.find((c) => c.code === code);
    return category ? pickText(locale, category.nameSq, category.nameEn) : code;
  };

  return (
    <article className={styles.ticket} aria-label={title}>
      <div className={styles.main}>
        <header className={styles.header}>
          {ticket.movie.posterPath && (
            <img
              className={styles.poster}
              src={ticket.movie.posterPath}
              alt=""
              width={600}
              height={900}
            />
          )}
          <div className={styles.show}>
            <h2 className={styles.title}>{title}</h2>
            <div className={styles.badges}>
              <AgeBadge rating={ticket.movie.ageRating} />
              {!valid && <Badge tone="warning">{t.ticket.status[ticket.status]}</Badge>}
            </div>
            <p className={styles.meta}>
              {ticket.location.name} · {ticket.hall.name} ({hallType})
            </p>
            <p className={styles.when}>{when}</p>
          </div>
        </header>

        <section aria-label={t.ticket.seats} className={styles.block}>
          <h3 className={styles.blockTitle}>{t.ticket.seats}</h3>
          {ticket.isWholeHall ? (
            <p>{t.ticket.suite}</p>
          ) : (
            <ul className={styles.lines}>
              {ticket.seats.map((seat) => (
                <li key={seat.seatId}>
                  <span>
                    {t.ticket.seatLine(seat.row, seat.number)} · {t.seats.types[seat.type]} ·{' '}
                    {seat.tickets.map((x) => categoryName(x.category)).join(' + ')}
                  </span>
                  <span>{formatPrice(locale, seat.totalCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {ticket.food.length > 0 && (
          <section aria-label={t.ticket.food} className={styles.block}>
            <h3 className={styles.blockTitle}>{t.ticket.food}</h3>
            <ul className={styles.lines}>
              {ticket.food.map((line) => (
                <li key={`${line.menuItemId}:${line.fulfillment}`}>
                  <span>
                    {t.food.line(line.quantity, pickText(locale, line.nameSq, line.nameEn))} ·{' '}
                    {line.fulfillment === 'PICKUP_AT_COUNTER'
                      ? t.ticket.pickup
                      : line.serveTiming === 'DURING_SHOW'
                        ? t.ticket.seatDuring
                        : t.ticket.seatBefore}
                  </span>
                  <span>{formatPrice(locale, line.totalCents)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className={styles.total}>
          <span>{t.ticket.total}</span>
          <strong>{formatPrice(locale, ticket.totalCents)}</strong>
        </p>
      </div>

      <div className={styles.stub}>
        {valid ? (
          <div className={styles.qr}>
            <QRCodeSVG
              value={ticketQrValue(ticket.code)}
              size={qrSize}
              level="M"
              marginSize={2}
              bgColor="transparent"
              fgColor="currentColor"
              role="img"
              aria-label={t.ticket.qr(ticket.code)}
            />
          </div>
        ) : (
          // A cancelled or refunded ticket does not let anyone in: no QR code to show.
          <Badge tone="warning">{t.ticket.status[ticket.status]}</Badge>
        )}
        {valid && qrNote && <p className={styles.qrNote}>{qrNote}</p>}
        <p className={styles.codeLabel}>{t.ticket.code}</p>
        <p className={styles.code}>{groupCode(ticket.code)}</p>
        <div className={styles.actions}>
          <Button
            variant="secondary"
            size="sm"
            icon="calendar"
            onClick={() => {
              downloadCalendarEvent(
                {
                  uid: `${ticket.code}@kinemax`,
                  startsAt: ticket.startsAt,
                  endsAt: ticket.endsAt,
                  title: `${title} · Kinemax`,
                  location: `${ticket.location.name}, ${ticket.location.address}`,
                  description: t.ticket.calendarDescription(ticket.code),
                  createdAt: new Date().toISOString(),
                },
                `kinemax-${ticket.code}.ics`,
              );
            }}
          >
            {t.ticket.addToCalendar}
          </Button>
          {actions}
        </div>
      </div>
    </article>
  );
}
