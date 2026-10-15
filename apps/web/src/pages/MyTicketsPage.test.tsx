import type { MyBookingsResponse, Ticket } from '@kinemax/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCsrfToken } from '../api/http';
import { LOCATION_STORAGE_KEY } from '../location/location-storage';
import { stubAuth, testUser } from '../test/auth';
import { renderApp } from '../test/catalog';
import { heldBooking, paidTicket, standardMap, TICKET_CODE } from '../test/seatmap';

beforeEach(() => {
  window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
  setCsrfToken(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const WAIT = { timeout: 5_000 };
const map = standardMap();
const base = paidTicket({ ...heldBooking(map, [map.seats[0]?.id ?? '']), status: 'CONFIRMED' });
const refunded: Ticket = {
  ...base,
  id: '0190f0a0-0000-7000-8000-0000000000d2',
  code: 'ZZZZ1111YYYY2222',
  status: 'REFUNDED',
  cancelledAt: '2026-10-14T10:00:00.000Z',
  cancellation: null,
  movie: { ...base.movie, titleSq: 'Dasma me tre nuse' },
};

/** The user's tickets; POST cancel refunds the upcoming one. */
function withTickets(lists: Partial<MyBookingsResponse> = {}, ticket: Ticket = base) {
  let current = ticket;
  const body: MyBookingsResponse = {
    upcoming: [base],
    past: [],
    cancelled: [refunded],
    ...lists,
  };
  return stubAuth(testUser(), {
    bookings: ({ method, path }) => {
      if (method === 'GET' && path === '/api/me/bookings') return body;
      if (method === 'GET' && path === `/api/me/bookings/${current.code}`) {
        return { ticket: current };
      }
      if (method === 'POST' && path === `/api/bookings/${current.id}/cancel`) {
        current = { ...current, status: 'REFUNDED', cancellation: null };
        return { ticket: current };
      }
      return undefined;
    },
  });
}

describe('Biletat e mia', () => {
  it('lists the tickets by tab; each card opens its ticket', async () => {
    withTickets();
    renderApp('/account/tickets');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Biletat e mia' }, WAIT),
    ).toBeInTheDocument();
    const tabs = await screen.findByRole('tablist', { name: 'Biletat sipas kohës' }, WAIT);
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Të ardhshme (1)', 'Të kaluara (0)', 'Të anuluara (1)']);
    const upcoming = screen.getByRole('tabpanel', { name: 'Të ardhshme (1)' });
    expect(within(upcoming).getByRole('link', { name: 'Kodi Orbital 9' })).toHaveAttribute(
      'href',
      `/account/tickets/${TICKET_CODE}`,
    );
    expect(within(upcoming).getByText('e martë, 20 tetor 2026 · 20:30')).toBeInTheDocument();
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Të kaluara (0)' }));
    expect(screen.getByText('Ende nuk ke shfaqje të kaluara.')).toBeInTheDocument();
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Të anuluara (1)' }));
    const panel = screen.getByRole('tabpanel', { name: 'Të anuluara (1)' });
    expect(within(panel).getByText('E rimbursuar')).toBeInTheDocument();
    expect(within(panel).getByText(/^Rimbursuar: /)).toBeInTheDocument();
  });

  it('suggests the schedule when there is nothing upcoming', async () => {
    withTickets({ upcoming: [], cancelled: [] });
    renderApp('/account/tickets');
    expect(
      await screen.findByText('Nuk ke bileta për shfaqjet që vijnë.', {}, WAIT),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shiko orarin' })).toHaveAttribute('href', '/schedule');
  });

  it('shows one ticket with a large QR code and the brightness tip', async () => {
    withTickets();
    renderApp(`/account/tickets/${TICKET_CODE}`);
    const qr = await screen.findByRole('img', { name: `Kodi QR i biletës ${TICKET_CODE}` }, WAIT);
    expect(qr).toHaveAttribute('width', '264');
    expect(
      screen.getByText('Rrit ndriçimin e ekranit kur tregon kodin QR në hyrje.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shto në kalendar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Të gjitha biletat' })).toHaveAttribute(
      'href',
      '/account/tickets',
    );
  });

  it('cancels after a confirmation that shows the refund first', async () => {
    const fake = withTickets();
    renderApp(`/account/tickets/${TICKET_CODE}`);
    const cancel = await screen.findByRole('button', { name: 'Anulo rezervimin' }, WAIT);
    expect(
      screen.getByText(/^Mund ta anulosh deri më e martë, 20 tetor 2026 · 18:30\.$/),
    ).toBeInTheDocument();
    fireEvent.click(cancel);
    const dialog = screen.getByRole('dialog', { name: 'Ta anulojmë rezervimin?' });
    expect(within(dialog).getByText(/^Do të rimbursohen 9,50 € \(demo\)/)).toBeInTheDocument();
    // "Jo, mbaje" changes nothing.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Jo, mbaje' }));
    expect(fake.requests.some((r) => r.method === 'POST')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Anulo rezervimin' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Po, anuloje' }),
    );
    expect(
      await screen.findByText('Rezervimi u anulua dhe u rimbursua (demo).', {}, WAIT),
    ).toBeInTheDocument();
    expect(fake.requests.filter((r) => r.method === 'POST').map((r) => r.path)).toEqual([
      `/api/bookings/${base.id}/cancel`,
    ]);
    // A refunded ticket shows its status, and no QR code to get in with.
    expect(screen.getAllByText('E rimbursuar').length).toBeGreaterThan(0);
    expect(screen.queryByRole('img', { name: /^Kodi QR/ })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Anulo rezervimin' })).not.toBeInTheDocument();
    });
  });

  it('explains why a booking can no longer be cancelled after the cutoff', async () => {
    const late: Ticket = {
      ...base,
      cancellation: { allowed: false, until: '2026-10-20T16:30:00.000Z', refundCents: 950 },
    };
    withTickets({ upcoming: [late] }, late);
    renderApp(`/account/tickets/${TICKET_CODE}`);
    expect(await screen.findByRole('button', { name: 'Anulo rezervimin' }, WAIT)).toBeDisabled();
    expect(
      screen.getByText(
        'Anulimi mbylli më e martë, 20 tetor 2026 · 18:30: rezervimet anulohen deri 2 orë para fillimit.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a friendly message for an unknown code', async () => {
    withTickets();
    renderApp('/account/tickets/NOPE');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kjo biletë nuk u gjet.' }, WAIT),
    ).toBeInTheDocument();
  });
});
