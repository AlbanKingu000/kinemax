import type { CheckoutResponse, Payment } from '@kinemax/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCsrfToken } from '../api/http';
import { LOCATION_STORAGE_KEY } from '../location/location-storage';
import { stubAuth, testUser } from '../test/auth';
import { renderApp } from '../test/catalog';
import {
  BOOKING_ID,
  heldBooking,
  paidTicket,
  SHOWTIME_ID,
  standardMap,
  TICKET_CODE,
} from '../test/seatmap';

// The QR library draws paths; the stand-in shows what it would encode.
vi.mock('qrcode.react', () => ({
  QRCodeSVG: (props: { value: string; 'aria-label'?: string }) => (
    <svg role="img" aria-label={props['aria-label']} data-value={props.value} />
  ),
}));

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
  setCsrfToken(null);
});

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

const STEP_WAIT = { timeout: 5_000 };
const PAY = `/booking/${SHOWTIME_ID}/pay`;
const PAYMENT_A = '0190f0a0-0000-7000-8000-0000000000p1'.replace('p', 'a');
const PAYMENT_B = '0190f0a0-0000-7000-8000-0000000000b9';
const CODE = TICKET_CODE;

/** A hold, a demo provider that answers what the buyer simulates, and the paid ticket. */
function withPayment(options: { checkoutStatus?: number } = {}) {
  const map = standardMap();
  let booking = heldBooking(map, [map.seats[0]?.id ?? '']);
  let payment: Payment | null = null;
  let opened = 0;
  const answer = (): CheckoutResponse => ({ payment: payment as Payment, booking });
  const fake = stubAuth(testUser(), {
    seatmap: { [map.showtime.id]: map },
    bookings: ({ method, path, body }) => {
      if (method === 'GET' && path === '/api/bookings/current') return { booking };
      if (method === 'POST' && path === `/api/bookings/${BOOKING_ID}/checkout`) {
        if (options.checkoutStatus) {
          return { status: options.checkoutStatus, body: { error: { code: 'x', message: 'x' } } };
        }
        if (payment?.status !== 'PENDING') {
          opened += 1;
          payment = {
            id: opened === 1 ? PAYMENT_A : PAYMENT_B,
            status: 'PENDING',
            amountCents: booking.totalCents,
            currency: 'EUR',
          };
        }
        return answer();
      }
      const simulate = /^\/api\/payments\/([^/]+)\/simulate$/.exec(path);
      if (method === 'POST' && simulate) {
        const { outcome } = body as { outcome: 'success' | 'decline' };
        if (payment && simulate[1] === payment.id && payment.status === 'PENDING') {
          payment = { ...payment, status: outcome === 'success' ? 'SUCCEEDED' : 'FAILED' };
          if (outcome === 'success') booking = { ...booking, status: 'CONFIRMED' };
        }
        return answer();
      }
      if (method === 'GET' && path === `/api/bookings/${BOOKING_ID}/ticket`) {
        return booking.status === 'CONFIRMED' ? { ticket: paidTicket(booking) } : undefined;
      }
      return undefined;
    },
  });
  return { fake, map };
}

/** A payment button once the payment is open (the buttons wait for it). */
async function enabled(name: string | RegExp) {
  const button = await screen.findByRole('button', { name }, STEP_WAIT);
  await waitFor(() => {
    expect(button).toBeEnabled();
  }, STEP_WAIT);
  return button;
}

const posts = (fake: ReturnType<typeof stubAuth>, suffix: string) =>
  fake.requests.filter((r) => r.method === 'POST' && r.path.endsWith(suffix));

describe('Demo payment step', () => {
  it('is clearly a demo: no card fields, a fixed demo card, the order and the countdown', async () => {
    const { fake } = withPayment();
    renderApp(PAY);
    const step = await screen.findByRole('region', { name: 'Pagesa' }, STEP_WAIT);
    expect(within(step).getByText('DEMO – nuk kryhet asnjë pagesë reale')).toBeInTheDocument();
    expect(
      within(step).getByRole('img', { name: 'Karta demo 4242 •••• •••• 4242' }),
    ).toBeInTheDocument();
    // Nothing to type: no inputs of any kind on the payment step.
    expect(step.querySelectorAll('input, textarea, select')).toHaveLength(0);
    expect(within(step).getByRole('timer')).toBeInTheDocument();
    const summary = within(step).getByRole('complementary', { name: 'Përmbledhja e porosisë' });
    expect(within(summary).getByText(/^Rreshti A, ulësja 1/)).toBeInTheDocument();
    await waitFor(() => {
      expect(posts(fake, '/checkout')).toHaveLength(1);
    });
    expect(
      await within(step).findByRole('button', { name: 'Paguaj (demo) · 4,50 €' }),
    ).toBeEnabled();
  });

  it('confirms and shows the ticket with a QR code of the booking code only', async () => {
    const { fake } = withPayment();
    renderApp(PAY);
    fireEvent.click(await enabled(/^Paguaj \(demo\)/));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Rezervimi u konfirmua' }, STEP_WAIT),
    ).toBeInTheDocument();
    expect(posts(fake, '/simulate').map((r) => r.body)).toEqual([{ outcome: 'success' }]);
    const qr = screen.getByRole('img', { name: `Kodi QR i biletës ${CODE}` });
    expect(qr).toHaveAttribute('data-value', `KINEMAX:${CODE}`);
    expect(screen.getByText('ABCD 1234 EFGH 5678')).toBeInTheDocument();
    expect(screen.getByText(/Te ulësja, gjatë filmit/)).toBeInTheDocument();
    expect(screen.getByText('e martë, 20 tetor 2026 · 20:30')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Biletat e mia' })).toHaveAttribute(
      'href',
      '/account/tickets',
    );
    // "Shto në kalendar" saves an .ics file.
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ics');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Shto në kalendar' }));
    expect(create).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
  });

  it('lets the buyer retry after a simulated decline with a new payment', async () => {
    const { fake } = withPayment();
    renderApp(PAY);
    fireEvent.click(await enabled('Simulo refuzim'));
    expect(await screen.findByText(/^Pagesa u refuzua \(demo\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Paguaj \(demo\)/ }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Rezervimi u konfirmua' }, STEP_WAIT),
    ).toBeInTheDocument();
    // The declined payment is closed: a second checkout opened a new one, which was paid.
    expect(posts(fake, '/checkout')).toHaveLength(2);
    expect(posts(fake, '/simulate').map((r) => r.path)).toEqual([
      `/api/payments/${PAYMENT_A}/simulate`,
      `/api/payments/${PAYMENT_B}/simulate`,
    ]);
  });

  it('sends a 15+/18+ booking without the age confirmation back to the tickets', async () => {
    withPayment({ checkoutStatus: 422 });
    renderApp(PAY);
    expect(
      await screen.findByText('Konfirmo kufirin e moshës te biletat para pagesës.', {}, STEP_WAIT),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Paguaj \(demo\)/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Kthehu te biletat' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Biletat' }, STEP_WAIT),
    ).toBeInTheDocument();
  });

  it('shows the expired view when the hold ran out', async () => {
    withPayment({ checkoutStatus: 410 });
    renderApp(PAY);
    expect(
      await screen.findByRole('heading', { name: 'Koha e rezervimit mbaroi' }, STEP_WAIT),
    ).toBeInTheDocument();
  });

  it('shows a friendly message for an unknown ticket', async () => {
    stubAuth(testUser(), { bookings: () => undefined });
    renderApp(`/booking/${BOOKING_ID}/confirmed`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ky rezervim nuk u gjet.' }, STEP_WAIT),
    ).toBeInTheDocument();
  });
});
