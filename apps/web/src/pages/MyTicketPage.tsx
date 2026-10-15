import { ticketResponseSchema, type Ticket } from '@kinemax/shared';
import { useState } from 'react';
import { useParams } from 'react-router';
import { ApiRequestError, apiRequest } from '../api/http';
import { localDateTime } from '../booking/ticket-format';
import { TicketView } from '../booking/TicketView';
import { Button, ButtonLink } from '../components/Button/Button';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { Container } from '../components/Layout/Layout';
import { Modal } from '../components/Modal/Modal';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { useAsync } from '../hooks/use-async';
import { usePageMeta } from '../hooks/use-page-meta';
import { formatLongDate, formatPrice } from '../i18n/format';
import { useLocale, useMessages } from '../i18n/use-messages';
import styles from './MyTicketsPage.module.css';

/** /account/tickets/:code: one ticket with a large QR code, the calendar file and cancellation. */
export function MyTicketPage() {
  const t = useMessages();
  const { code = '' } = useParams();
  usePageMeta(`${t.myTickets.title} · ${t.meta.titleSuffix}`, t.myTickets.description);
  const loaded = useAsync(
    (signal) =>
      apiRequest(`/api/me/bookings/${encodeURIComponent(code)}`, {
        schema: ticketResponseSchema,
        signal,
      }),
    code,
  );
  // After a cancellation the server's new ticket replaces the loaded one.
  const [changed, setChanged] = useState<Ticket | null>(null);

  const back = (
    <ButtonLink to="/account/tickets" variant="ghost" size="sm" icon="chevronLeft">
      {t.myTickets.back}
    </ButtonLink>
  );
  if (loaded.status === 'loading') {
    return (
      <Container className={styles.page}>
        <div aria-busy="true">
          <p role="status" className="visually-hidden">
            {t.common.loading}
          </p>
          <Skeleton shape="rect" height="24rem" />
        </div>
      </Container>
    );
  }
  if (loaded.status === 'error') {
    const missing = loaded.error instanceof ApiRequestError && loaded.error.status === 404;
    return (
      <Container narrow className={styles.page}>
        <EmptyState
          icon={missing ? 'search' : 'warning'}
          tone={missing ? 'neutral' : 'error'}
          headingLevel="h1"
          title={missing ? t.myTickets.notFound : t.myTickets.loadError}
          action={
            missing ? (
              back
            ) : (
              <Button variant="secondary" onClick={loaded.retry}>
                {t.common.retry}
              </Button>
            )
          }
        />
      </Container>
    );
  }
  const ticket = changed?.id === loaded.data.ticket.id ? changed : loaded.data.ticket;
  return (
    <Container className={styles.page}>
      <div>{back}</div>
      <h1 className="visually-hidden">{t.myTickets.title}</h1>
      <TicketView
        ticket={ticket}
        qrSize={264}
        qrNote={t.myTickets.brightness}
        actions={<Cancellation ticket={ticket} onCancelled={setChanged} />}
      />
    </Container>
  );
}

/** "Anulo rezervimin": a confirmation with the refund first; after the cutoff, why not. */
function Cancellation({
  ticket,
  onCancelled,
}: {
  ticket: Ticket;
  onCancelled: (ticket: Ticket) => void;
}) {
  const t = useMessages();
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { cancellation } = ticket;

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest(`/api/bookings/${ticket.id}/cancel`, {
        method: 'POST',
        schema: ticketResponseSchema,
      });
      setOpen(false);
      setNotice(t.myTickets.cancelledNotice);
      onCancelled(result.ticket);
    } catch {
      setError(t.myTickets.cancelError);
    } finally {
      setBusy(false);
    }
  }

  const status = (
    <p role="status" className={styles.meta}>
      {notice}
    </p>
  );
  if (!cancellation) return status;
  const until = localDateTime(cancellation.until, ticket.location.timeZone);
  const when = `${formatLongDate(locale, t, until.date)} · ${until.time}`;
  const amount = formatPrice(locale, cancellation.refundCents);
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        disabled={!cancellation.allowed}
        aria-describedby="cancel-rule"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t.myTickets.cancel}
      </Button>
      <p id="cancel-rule" className={styles.meta}>
        {cancellation.allowed ? t.myTickets.cancelUntil(when) : t.myTickets.cutoffPassed(when)}
      </p>
      {status}
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={t.myTickets.dialogTitle}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setOpen(false);
              }}
            >
              {t.myTickets.keep}
            </Button>
            <Button loading={busy} onClick={() => void confirm()}>
              {t.myTickets.confirmCancel}
            </Button>
          </>
        }
      >
        <p>{t.myTickets.dialogBody(amount)}</p>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </Modal>
    </>
  );
}
