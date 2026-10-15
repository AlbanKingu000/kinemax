import { myBookingsResponseSchema, type Ticket } from '@kinemax/shared';
import { Link } from 'react-router';
import { apiRequest } from '../api/http';
import { AgeBadge, Badge } from '../components/Badge/Badge';
import { Button, ButtonLink } from '../components/Button/Button';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { Container } from '../components/Layout/Layout';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { Tabs } from '../components/Tabs/Tabs';
import { useAsync } from '../hooks/use-async';
import { usePageMeta } from '../hooks/use-page-meta';
import { formatLongDate, formatPrice } from '../i18n/format';
import { pickText } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import styles from './MyTicketsPage.module.css';

/** /account/tickets: the signed-in user's tickets, upcoming / past / cancelled. */
export function MyTicketsPage() {
  const t = useMessages();
  usePageMeta(`${t.myTickets.title} · ${t.meta.titleSuffix}`, t.myTickets.description);
  const lists = useAsync(
    (signal) => apiRequest('/api/me/bookings', { schema: myBookingsResponseSchema, signal }),
    'me',
  );

  return (
    <Container className={styles.page}>
      <h1 className={styles.title}>{t.myTickets.title}</h1>
      {lists.status === 'loading' ? (
        <div aria-busy="true">
          <p role="status" className="visually-hidden">
            {t.common.loading}
          </p>
          <Skeleton shape="rect" height="12rem" />
        </div>
      ) : lists.status === 'error' ? (
        <EmptyState
          icon="warning"
          tone="error"
          title={t.myTickets.loadError}
          action={
            <Button variant="secondary" onClick={lists.retry}>
              {t.common.retry}
            </Button>
          }
        />
      ) : (
        <Tabs
          label={t.myTickets.tabsLabel}
          tabs={(
            [
              ['upcoming', t.myTickets.upcoming, t.myTickets.emptyUpcoming],
              ['past', t.myTickets.past, t.myTickets.emptyPast],
              ['cancelled', t.myTickets.cancelled, t.myTickets.emptyCancelled],
            ] as const
          ).map(([id, label, empty]) => ({
            id,
            label: `${label} (${String(lists.data[id].length)})`,
            content:
              lists.data[id].length === 0 ? (
                <EmptyState
                  icon="ticket"
                  title={empty}
                  headingLevel="h2"
                  action={
                    id === 'upcoming' ? (
                      <ButtonLink to="/schedule" icon="calendar">
                        {t.myTickets.browse}
                      </ButtonLink>
                    ) : undefined
                  }
                />
              ) : (
                <ul className={styles.list}>
                  {lists.data[id].map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} />
                  ))}
                </ul>
              ),
          }))}
        />
      )}
    </Container>
  );
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  const t = useMessages();
  const { locale } = useLocale();
  const title = pickText(locale, ticket.movie.titleSq, ticket.movie.titleEn);
  const people = ticket.seats.reduce((n, seat) => n + seat.tickets.length, 0);
  return (
    <li className={styles.card}>
      {ticket.movie.posterPath && (
        <img
          className={styles.poster}
          src={ticket.movie.posterPath}
          alt=""
          width={600}
          height={900}
        />
      )}
      <div className={styles.body}>
        <h2 className={styles.name}>
          <Link to={`/account/tickets/${ticket.code}`} className={styles.link}>
            {title}
          </Link>
        </h2>
        <div className={styles.badges}>
          <AgeBadge rating={ticket.movie.ageRating} />
          {ticket.status !== 'CONFIRMED' && (
            <Badge tone="warning">{t.ticket.status[ticket.status]}</Badge>
          )}
        </div>
        <p className={styles.when}>
          {formatLongDate(locale, t, ticket.localDate)} · {ticket.localTime}
        </p>
        <p className={styles.meta}>
          {ticket.location.name} · {ticket.hall.name} ·{' '}
          {ticket.isWholeHall ? t.ticket.suite : t.myTickets.seats(people)}
        </p>
        <p className={styles.meta}>
          {ticket.status === 'REFUNDED'
            ? t.myTickets.refunded(formatPrice(locale, ticket.totalCents))
            : formatPrice(locale, ticket.totalCents)}
        </p>
      </div>
      <span className={styles.open} aria-hidden="true">
        {t.myTickets.open}
      </span>
    </li>
  );
}
