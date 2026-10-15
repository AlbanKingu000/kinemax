import { ticketResponseSchema } from '@kinemax/shared';
import { useParams } from 'react-router';
import { ApiRequestError, apiRequest } from '../api/http';
import { TicketView } from '../booking/TicketView';
import { Button, ButtonLink } from '../components/Button/Button';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { Container } from '../components/Layout/Layout';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { useAsync } from '../hooks/use-async';
import { usePageMeta } from '../hooks/use-page-meta';
import { useMessages } from '../i18n/use-messages';
import styles from './ConfirmationPage.module.css';

/** /booking/:bookingId/confirmed: the paid booking as a ticket with its QR code. */
export function ConfirmationPage() {
  const t = useMessages();
  const { bookingId = '' } = useParams();
  usePageMeta(`${t.confirmation.title} · ${t.meta.titleSuffix}`, t.confirmation.intro);
  const ticket = useAsync(
    (signal) =>
      apiRequest(`/api/bookings/${encodeURIComponent(bookingId)}/ticket`, {
        schema: ticketResponseSchema,
        signal,
      }),
    bookingId,
  );

  if (ticket.status === 'loading') {
    return (
      <Container narrow className={styles.page}>
        <div aria-busy="true">
          <p role="status" className="visually-hidden">
            {t.common.loading}
          </p>
          <Skeleton shape="rect" height="24rem" />
        </div>
      </Container>
    );
  }
  if (ticket.status === 'error') {
    const missing =
      ticket.error instanceof ApiRequestError &&
      (ticket.error.status === 404 || ticket.error.status === 400);
    return (
      <Container narrow className={styles.page}>
        <EmptyState
          icon={missing ? 'search' : 'warning'}
          tone={missing ? 'neutral' : 'error'}
          headingLevel="h1"
          title={missing ? t.confirmation.notFound : t.confirmation.loadError}
          action={
            missing ? (
              <ButtonLink to="/account/tickets" icon="ticket">
                {t.ticket.myTickets}
              </ButtonLink>
            ) : (
              <Button variant="secondary" onClick={ticket.retry}>
                {t.common.retry}
              </Button>
            )
          }
        />
      </Container>
    );
  }
  return (
    <Container className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t.confirmation.title}</h1>
        <p className={styles.intro}>{t.confirmation.intro}</p>
      </header>
      <TicketView
        ticket={ticket.data.ticket}
        actions={
          <ButtonLink to="/account/tickets" variant="ghost" size="sm" icon="ticket">
            {t.ticket.myTickets}
          </ButtonLink>
        }
      />
    </Container>
  );
}
