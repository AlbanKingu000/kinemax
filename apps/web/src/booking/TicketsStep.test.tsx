import type { Booking } from '@kinemax/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCsrfToken } from '../api/http';
import { LOCATION_STORAGE_KEY } from '../location/location-storage';
import { stubAuth, testUser } from '../test/auth';
import { renderApp } from '../test/catalog';
import {
  BOOKING_ID,
  heldBooking,
  SHOWTIME_ID,
  standardMap,
  SUITE_SHOWTIME_ID,
  suiteMap,
} from '../test/seatmap';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
  setCsrfToken(null);
});

afterEach(() => {
  window.sessionStorage.clear();
  vi.useRealTimers();
});

// Steps that cross a navigation wait for the session, the seat map and the hold (slow under
// coverage with every test file running in parallel).
const STEP_WAIT = { timeout: 5_000 };
const TICKETS = `/booking/${SHOWTIME_ID}/tickets`;

/** A signed-in user with `booking` on hold; PUT answers with `priced(body)`. */
function withHold(
  map: ReturnType<typeof standardMap>,
  booking: Booking | null,
  priced: (body: {
    tickets: { seatId: string; occupant: number; category: string }[];
  }) => Booking = () => booking as Booking,
) {
  let current = booking;
  return stubAuth(testUser(), {
    seatmap: { [map.showtime.id]: map },
    bookings: ({ method, path, body }) => {
      if (method === 'GET' && path === '/api/bookings/current') return { booking: current };
      if (method === 'PUT' && path === `/api/bookings/${BOOKING_ID}/tickets`) {
        current = priced(body as Parameters<typeof priced>[0]);
        return { booking: current };
      }
      if (method === 'DELETE' && path === `/api/bookings/${BOOKING_ID}/hold`) {
        current = null;
        return { status: 204, body: null };
      }
      return undefined;
    },
  });
}

describe('Tickets step', () => {
  it('shows the countdown, one category per person and server totals; changes are priced by the server', async () => {
    const map = standardMap();
    const [a1] = map.seats;
    const sofa = map.seats.find((s) => s.type === 'COUPLE');
    const booking = heldBooking(map, [a1?.id ?? '', sofa?.id ?? '']);
    const fake = withHold(map, booking, (body) => ({
      ...booking,
      seats: booking.seats.map((seat) => ({
        ...seat,
        tickets: seat.tickets.map((t) => {
          const category =
            body.tickets.find((b) => b.seatId === seat.seatId && b.occupant === t.occupant)
              ?.category ?? 'ADULT';
          return { ...t, category, priceCents: category === 'STUDENT' ? 360 : 450 };
        }),
      })),
      totalCents: 1460,
    }));
    renderApp(TICKETS);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Biletat' }, STEP_WAIT),
    ).toBeInTheDocument();
    expect(screen.getByRole('timer', { name: 'Koha e mbetur' })).toHaveTextContent(
      /^(10:00|09:5\d)$/,
    );
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
    expect(screen.getByLabelText('Kategoria e biletës')).toHaveValue('ADULT');
    expect(screen.getByLabelText('Kategoria e biletës, personi 2')).toHaveValue('ADULT');
    expect(screen.getByText('Shtesa për divanin (një herë)')).toBeInTheDocument();
    expect(screen.getByText('15,50 €')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Kategoria e biletës, personi 2'), {
      target: { value: 'STUDENT' },
    });
    expect(await screen.findByText('14,60 €', {}, STEP_WAIT)).toBeInTheDocument();
    expect(screen.getByText('Me kartë studenti të vlefshme.')).toBeInTheDocument();
    const put = fake.requests.find((r) => r.method === 'PUT');
    expect(put?.body).toEqual({
      tickets: [
        { seatId: a1?.id, occupant: 1, category: 'ADULT' },
        { seatId: sofa?.id, occupant: 1, category: 'ADULT' },
        { seatId: sofa?.id, occupant: 2, category: 'STUDENT' },
      ],
      ageRatingConfirmed: false,
    });
  });

  it('needs the age confirmation for 15+ and 18+ films before continuing', async () => {
    const map = standardMap();
    const booking = heldBooking(map, [map.seats[0]?.id ?? ''], {
      ageRating: 'AGE_18',
      ageConfirmationRequired: true,
    });
    const fake = withHold(map, booking, () => ({ ...booking, ageRatingConfirmed: true }));
    renderApp(TICKETS);
    const proceed = await screen.findByRole('button', { name: 'Vazhdo' }, STEP_WAIT);
    fireEvent.click(proceed);
    expect(screen.getByText('Konfirmo kufirin e moshës për të vazhduar.')).toBeInTheDocument();
    const box = screen.getByRole('checkbox', {
      name: 'Konfirmoj që të gjithë shikuesit i plotësojnë kufirin e moshës',
    });
    expect(box).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(box);
    await waitFor(() => {
      expect(fake.requests.find((r) => r.method === 'PUT')?.body).toMatchObject({
        ageRatingConfirmed: true,
      });
    });
    await waitFor(() => {
      expect(proceed).toBeEnabled();
    });
    fireEvent.click(proceed);
    // On to the optional food & drinks step.
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Ushqimi & pijet' }, STEP_WAIT),
    ).toBeInTheDocument();
  });

  it('announces 5 and 1 minutes left and sends the buyer back when the hold expires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const map = standardMap();
    const booking = heldBooking(map, [map.seats[0]?.id ?? ''], {
      holdExpiresAt: new Date(Date.now() + 5 * 60_000 + 2_000).toISOString(),
    });
    withHold(map, booking);
    const { router } = renderApp(TICKETS);
    const timer = await screen.findByRole('timer', {}, STEP_WAIT);
    const live = () => document.querySelector('[aria-live="assertive"]');
    expect(live()).toHaveTextContent('');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(live()).toHaveTextContent('Kanë mbetur 5 minuta');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60_000);
    });
    expect(timer).toHaveTextContent(/^00:\d\d$/);
    expect(live()).toHaveTextContent('Ka mbetur 1 minutë');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByRole('heading', { name: 'Koha e rezervimit mbaroi' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Kthehu te ulëset' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/booking/${SHOWTIME_ID}`);
    });
  });

  it('"Ndrysho ulëset" releases the hold and returns to the map with the same seats', async () => {
    const map = standardMap();
    const booking = heldBooking(map, [map.seats[2]?.id ?? '']);
    const fake = withHold(map, booking);
    const { router } = renderApp(TICKETS);
    fireEvent.click(await screen.findByRole('button', { name: 'Ndrysho ulëset' }, STEP_WAIT));
    expect(
      await screen.findByRole('button', { name: /^Rreshti A, ulësja 3,/ }, STEP_WAIT),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(router.state.location.pathname).toBe(`/booking/${SHOWTIME_ID}`);
    expect(fake.requests).toContainEqual({
      method: 'DELETE',
      path: `/api/bookings/${BOOKING_ID}/hold`,
      body: undefined,
    });
  });

  it('resumes a live hold when the buyer comes back to the map', async () => {
    const map = standardMap();
    withHold(map, heldBooking(map, [map.seats[0]?.id ?? '']));
    const { router } = renderApp(`/booking/${SHOWTIME_ID}`);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Biletat' }, STEP_WAIT),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(TICKETS);
  });

  it('goes back to the map when there is no hold', async () => {
    const map = standardMap();
    withHold(map, null);
    const { router } = renderApp(TICKETS);
    expect(
      await screen.findByRole('group', { name: 'Ulëset në Salla 1' }, STEP_WAIT),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/booking/${SHOWTIME_ID}`);
  });

  it('shows a held suite with its price and no ticket categories', async () => {
    const map = suiteMap();
    withHold(
      map,
      heldBooking(map, [], {
        showtimeId: SUITE_SHOWTIME_ID,
        isWholeHall: true,
        wholeHallPriceCents: 11_000,
        totalCents: 11_000,
      }),
    );
    renderApp(`/booking/${SUITE_SHOWTIME_ID}/tickets`);
    const step = await screen.findByRole('region', { name: 'Biletat' }, STEP_WAIT);
    expect(within(step).getByText('Çmimi i suitës')).toBeInTheDocument();
    expect(within(step).getAllByText('110,00 €')).toHaveLength(2);
    expect(within(step).queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('Holding seats', () => {
  it('drops seats someone else took first and refreshes the map', async () => {
    const map = standardMap();
    const [a1, a2] = map.seats;
    let seatmapCalls = 0;
    stubAuth(testUser(), {
      seatmap: {
        [SHOWTIME_ID]: () => {
          seatmapCalls += 1;
          return map;
        },
      },
      bookings: ({ method }) =>
        method === 'POST'
          ? {
              status: 409,
              body: { error: { code: 'conflict', message: 'x', takenSeatIds: [a2?.id] } },
            }
          : { booking: null },
    });
    renderApp(`/booking/${SHOWTIME_ID}`);
    fireEvent.click(
      await screen.findByRole('button', { name: /^Rreshti A, ulësja 1,/ }, STEP_WAIT),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Rreshti A, ulësja 2,/ }));
    const panel = screen.getByRole('complementary');
    fireEvent.click(within(panel).getByRole('button', { name: 'Vazhdo' }));
    expect(
      await within(panel).findByText(/sapo u zunë nga dikush tjetër/, {}, STEP_WAIT),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Rreshti A, ulësja 2,/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: /^Rreshti A, ulësja 1,/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() => {
      expect(seatmapCalls).toBe(2);
    });
    expect(a1).toBeDefined();
  });
});
