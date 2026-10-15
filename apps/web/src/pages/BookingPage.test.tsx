import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCsrfToken } from '../api/http';
import { SEATMAP_REFRESH_MS } from '../booking/use-seat-map';
import { LOCATION_STORAGE_KEY } from '../location/location-storage';
import { stubAuth, testUser } from '../test/auth';
import { renderApp } from '../test/catalog';
import {
  heldBooking,
  seat,
  SHOWTIME_ID,
  standardMap,
  SUITE_SHOWTIME_ID,
  suiteMap,
} from '../test/seatmap';

// three.js does not run in jsdom: a stand-in that shows which seat the camera looks from. Its
// "arrive" button plays the end of the camera glide; its "step" buttons the [ and ] keys.
vi.mock('../booking/Hall3D', () => ({
  default: (props: {
    label: string;
    viewSeat: { id: string } | null;
    recenterSignal: number;
    onArrive: (id: string) => void;
    onStep: (step: -1 | 1) => void;
  }) => (
    <div
      role="img"
      aria-label={props.label}
      data-view-seat={props.viewSeat?.id ?? ''}
      data-recenter={props.recenterSignal}
    >
      <button
        type="button"
        onClick={() => {
          if (props.viewSeat) props.onArrive(props.viewSeat.id);
        }}
      >
        arrive
      </button>
      <button
        type="button"
        onClick={() => {
          props.onStep(1);
        }}
      >
        step ]
      </button>
    </div>
  ),
}));

beforeEach(() => {
  // jsdom has no WebGL: the page uses the 2D map (the 3D path is covered by e2e).
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
  setCsrfToken(null);
});

afterEach(() => {
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

/** A WebGL-capable browser at desktop or phone width. */
function withWebGL(desktop: boolean) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as RenderingContext);
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(min-width: 1024px)' && desktop,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  );
}

// Opening the tickets step waits for the session, the seat map and the hold (slow under coverage).
const STEP_WAIT = { timeout: 5_000 };
const seatButton = (name: RegExp) => screen.getByRole('button', { name });
const map = () => screen.getByRole('group', { name: 'Ulëset në Salla 1' });

describe('BookingPage: seat map', () => {
  it('shows the show summary and a keyboard-operable 2D map without WebGL', async () => {
    stubAuth(null, { seatmap: { [SHOWTIME_ID]: standardMap() } });
    renderApp(`/booking/${SHOWTIME_ID}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kodi Orbital 9' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Kinemax Prizren · Salla 1 \(Standard\)/)).toBeInTheDocument();
    expect(screen.getByText(/e martë, 13 tetor 2026 · 20:30/)).toBeInTheDocument();
    expect(screen.getByText(/Pamja 3D nuk mbështetet/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Pamja e sallës' })).not.toBeInTheDocument();

    // Full spoken labels with type, state and price.
    const a1 = seatButton(/^Rreshti A, ulësja 1,/);
    expect(a1).toHaveAccessibleName('Rreshti A, ulësja 1, Standard, e lirë, 4,50 €');
    expect(seatButton(/^Rreshti B, ulësja 5,/)).toHaveAccessibleName(
      'Rreshti B, ulësja 5, Standard, e zënë, 4,50 €',
    );
    expect(seatButton(/^Rreshti B, ulësja 1,/)).toHaveAccessibleName(
      'Rreshti B, ulësja 1, Divan për dy, e lirë, 11,00 €',
    );
    // One tab stop (roving tabindex), arrows move, Enter selects.
    const tabStops = within(map())
      .getAllByRole('button')
      .filter((b) => b.tabIndex === 0);
    expect(tabStops).toEqual([a1]);
    a1.focus();
    fireEvent.keyDown(a1, { key: 'ArrowRight' });
    const a2 = seatButton(/^Rreshti A, ulësja 2,/);
    expect(a2).toHaveFocus();
    expect(a2.tabIndex).toBe(0);
    fireEvent.keyDown(a2, { key: 'ArrowDown' });
    expect(seatButton(/^Rreshti B, ulësja 1,/)).toHaveFocus();
    fireEvent.keyDown(seatButton(/^Rreshti B, ulësja 1,/), { key: 'ArrowUp' });
    const focused = document.activeElement as HTMLElement;
    expect(focused).toHaveAccessibleName(/^Rreshti A, ulësja 1,/);
    fireEvent.keyDown(focused, { key: 'Enter' });
    fireEvent.click(focused);
    expect(focused).toHaveAttribute('aria-pressed', 'true');

    // Taken seats cannot be chosen.
    fireEvent.click(seatButton(/^Rreshti B, ulësja 5,/));
    expect(seatButton(/^Rreshti B, ulësja 5,/)).toHaveAttribute('aria-pressed', 'false');
  });

  it('sums the estimated price, counts a sofa as 2 tickets and stops at 10', async () => {
    const base = standardMap();
    stubAuth(null, {
      seatmap: { [SHOWTIME_ID]: { ...base, seats: [...base.seats, seat('C', 1), seat('C', 2)] } },
    });
    renderApp(`/booking/${SHOWTIME_ID}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Rreshti B, ulësja 1,/ }));
    fireEvent.click(seatButton(/^Rreshti A, ulësja 1,/));
    const panel = screen.getByRole('complementary');
    expect(within(panel).getByText(/Totali i përafërt · 3 bileta/)).toBeInTheDocument();
    expect(within(panel).getByText('15,50 €')).toBeInTheDocument();
    expect(within(panel).getByText('çmimi final llogaritet në hapin tjetër')).toBeInTheDocument();
    for (const n of [2, 3, 4, 5, 6])
      fireEvent.click(seatButton(new RegExp(`^Rreshti A, ulësja ${String(n)},`)));
    fireEvent.click(seatButton(/^Rreshti B, ulësja 4,/));
    fireEvent.click(seatButton(/^Rreshti C, ulësja 1,/)); // 10 tickets now
    fireEvent.click(seatButton(/^Rreshti C, ulësja 2,/)); // the 11th
    expect(within(panel).getByRole('status')).toHaveTextContent(/deri në 10 bileta/);
    expect(seatButton(/^Rreshti C, ulësja 2,/)).toHaveAttribute('aria-pressed', 'false');
  });

  it('suggests the companion seat when a wheelchair space is chosen', async () => {
    stubAuth(null, { seatmap: { [SHOWTIME_ID]: standardMap() } });
    renderApp(`/booking/${SHOWTIME_ID}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Rreshti B, ulësja 3,/ }));
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(/ulësen shoqëruese/);
  });

  it('keeps the selection through the login redirect and drops seats taken meanwhile', async () => {
    const first = standardMap();
    const a1 = first.seats[0];
    const a2 = first.seats[1];
    stubAuth(null, { seatmap: { [SHOWTIME_ID]: first } });
    const { router, unmount } = renderApp(`/booking/${SHOWTIME_ID}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Rreshti A, ulësja 1,/ }));
    fireEvent.click(seatButton(/^Rreshti A, ulësja 2,/));
    fireEvent.click(
      within(screen.getByRole('complementary')).getByRole('button', { name: 'Vazhdo' }),
    );
    await waitFor(() => {
      expect(router.state.location.pathname + router.state.location.search).toBe(
        `/login?next=%2Fbooking%2F${SHOWTIME_ID}`,
      );
    });
    unmount();

    // Back after login: A2 was taken in the meantime.
    const later = {
      ...first,
      seats: first.seats.map((s) => (s.id === a2?.id ? { ...s, status: 'TAKEN' as const } : s)),
    };
    let held = false;
    const fake = stubAuth(testUser(), {
      seatmap: { [SHOWTIME_ID]: later },
      bookings: ({ method, path }) => {
        const booking = heldBooking(later, [a1?.id ?? '']);
        if (method === 'POST' && path === '/api/bookings/hold') {
          held = true;
          return { status: 201, body: { booking } };
        }
        return { booking: held ? booking : null };
      },
    });
    const app = renderApp(`/booking/${SHOWTIME_ID}`);
    expect(await screen.findByRole('button', { name: /^Rreshti A, ulësja 1,/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(seatButton(/^Rreshti A, ulësja 2,/)).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/u zu ndërkohë dhe u hoq/)).toBeInTheDocument();
    // Signed in: Vazhdo holds the remaining seat on the server and opens the tickets step.
    fireEvent.click(
      within(screen.getByRole('complementary')).getByRole('button', { name: 'Vazhdo' }),
    );
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Biletat' }, STEP_WAIT),
    ).toBeInTheDocument();
    expect(app.router.state.location.pathname).toBe(`/booking/${SHOWTIME_ID}/tickets`);
    expect(fake.requests).toContainEqual({
      method: 'POST',
      path: '/api/bookings/hold',
      body: { showtimeId: SHOWTIME_ID, seatIds: [a1?.id] },
    });
  });

  it('refreshes every 20 s while visible, pauses when hidden, and unselects seats taken meanwhile', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let current = standardMap();
    let requests = 0;
    stubAuth(null, {
      seatmap: {
        [SHOWTIME_ID]: () => {
          requests += 1;
          return current;
        },
      },
    });
    renderApp(`/booking/${SHOWTIME_ID}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Rreshti A, ulësja 1,/ }));
    expect(requests).toBe(1);

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SEATMAP_REFRESH_MS * 3);
    });
    expect(requests).toBe(1);

    current = {
      ...current,
      seats: current.seats.map((s, i) => (i === 0 ? { ...s, status: 'TAKEN' as const } : s)),
    };
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(requests).toBe(2);
    expect(seatButton(/^Rreshti A, ulësja 1,/)).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/u zu ndërkohë dhe u hoq/)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SEATMAP_REFRESH_MS + 10);
    });
    expect(requests).toBe(3);
    vi.useRealTimers();
  });

  it('offers a suite only as a whole', async () => {
    stubAuth(null, { seatmap: { [SUITE_SHOWTIME_ID]: suiteMap() } });
    renderApp(`/booking/${SUITE_SHOWTIME_ID}`);
    const book = await screen.findByRole('button', { name: 'Rezervo gjithë suitën' });
    expect(screen.queryByRole('group', { name: /Ulëset në/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('110,00 €').length).toBeGreaterThan(0);
    fireEvent.click(book);
    expect(screen.getByRole('button', { name: 'Suita e zgjedhur' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(window.sessionStorage.getItem(`kinemax.selection.${SUITE_SHOWTIME_ID}`)).toBe(
      '["WHOLE_HALL"]',
    );
  });

  it('says when a suite is taken', async () => {
    stubAuth(null, { seatmap: { [SUITE_SHOWTIME_ID]: suiteMap(true) } });
    renderApp(`/booking/${SUITE_SHOWTIME_ID}`);
    expect(
      await screen.findByText('Kjo suitë është e rezervuar për këtë shfaqje.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rezervo gjithë suitën' })).not.toBeInTheDocument();
  });

  it('explains started and unknown shows', async () => {
    stubAuth(null, {
      seatmap: { [SHOWTIME_ID]: { status: 410, body: { error: { code: 'gone', message: 'x' } } } },
    });
    const { unmount } = renderApp(`/booking/${SHOWTIME_ID}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kjo shfaqje ka filluar' }),
    ).toBeInTheDocument();
    unmount();
    stubAuth(null);
    renderApp('/booking/not-a-show');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kjo shfaqje nuk u gjet' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Te orari' })).toHaveAttribute('href', '/schedule');
  });
});

describe('BookingPage: 3D and 2D', () => {
  const hall3d = () => screen.findByRole('img', { name: 'Salla 1 në 3D' });

  it('opens the 3D hall on desktop and the 2D map on phones', async () => {
    withWebGL(true);
    stubAuth(null, { seatmap: { [SHOWTIME_ID]: standardMap() } });
    const { unmount } = renderApp(`/booking/${SHOWTIME_ID}`);
    expect(await hall3d()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3D' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Rikthe pamjen' })).toBeInTheDocument();
    expect(screen.queryByText(/Pamja 3D nuk mbështetet/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2D' }));
    expect(map()).toBeInTheDocument();
    unmount();

    withWebGL(false);
    renderApp(`/booking/${SHOWTIME_ID}`);
    expect(await screen.findByRole('group', { name: 'Ulëset në Salla 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2D' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Shiko sallën në 3D' }));
    expect(await hall3d()).toBeInTheDocument();
  });

  it('opens the view from a seat picked in 2D; choosing happens in the overlay', async () => {
    withWebGL(false);
    const data = standardMap();
    stubAuth(null, { seatmap: { [SHOWTIME_ID]: data } });
    renderApp(`/booking/${SHOWTIME_ID}`);
    const a1 = await screen.findByRole('button', { name: /^Rreshti A, ulësja 1,/ });
    a1.focus();
    fireEvent.keyDown(a1, { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Shiko pamjen nga Rreshti A, ulësja 2' }));
    const hall = await hall3d();
    expect(hall).toHaveAttribute('data-view-seat', data.seats[1]?.id);
    // The overlay waits for the camera to arrive.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rikthe pamjen' })).not.toBeInTheDocument();
    fireEvent.click(within(hall).getByRole('button', { name: 'arrive' }));
    const overlay = screen.getByRole('dialog', { name: 'Rreshti A · Ulësja 2 · Standard' });
    fireEvent.click(within(overlay).getByRole('button', { name: 'Zgjidh këtë ulëse' }));
    expect(within(screen.getByRole('complementary')).getByText(/1 biletë/)).toBeInTheDocument();
    fireEvent.click(within(overlay).getByRole('button', { name: 'Hiqe' }));
    fireEvent.click(within(overlay).getByRole('button', { name: 'Kthehu te salla' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(hall).toHaveAttribute('data-view-seat', '');
  });

  it('the seat view shows the distance, moves along the row and looks back at the screen', async () => {
    withWebGL(false);
    const data = standardMap();
    stubAuth(null, { seatmap: { [SHOWTIME_ID]: data } });
    renderApp(`/booking/${SHOWTIME_ID}`);
    const a1 = await screen.findByRole('button', { name: /^Rreshti A, ulësja 1,/ });
    a1.focus();
    fireEvent.keyDown(a1, { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Shiko pamjen nga Rreshti A, ulësja 2' }));
    const hall = await hall3d();
    fireEvent.click(within(hall).getByRole('button', { name: 'arrive' }));
    const overlay = screen.getByRole('dialog');
    // Eye (-2, 1.18, 5) to the screen center (0, 3, 0): about 5.7 m.
    expect(within(overlay).getByText('Distanca nga ekrani ~6 m')).toBeInTheDocument();

    const prev = within(overlay).getByRole('button', { name: 'Ulësja e mëparshme' });
    const next = within(overlay).getByRole('button', { name: 'Ulësja tjetër' });
    prev.focus();
    fireEvent.click(prev);
    expect(hall).toHaveAttribute('data-view-seat', data.seats[0]?.id);
    // The overlay stays during the short glide to the neighbour and names the new seat.
    expect(
      screen.getByRole('dialog', { name: 'Rreshti A · Ulësja 1 · Standard' }),
    ).toBeInTheDocument();
    // Row end: the button turns off and the focus moves to the other direction.
    expect(prev).toBeDisabled();
    expect(next).toHaveFocus();
    fireEvent.click(within(hall).getByRole('button', { name: 'step ]' }));
    expect(hall).toHaveAttribute('data-view-seat', data.seats[1]?.id);
    expect(prev).toBeEnabled();

    expect(hall).toHaveAttribute('data-recenter', '0');
    fireEvent.click(within(overlay).getByRole('button', { name: 'Shiko ekranin' }));
    expect(hall).toHaveAttribute('data-recenter', '1');
  });

  it('switches the header to the cinema of the show', async () => {
    window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prishtine');
    stubAuth(null, { seatmap: { [SHOWTIME_ID]: standardMap() } });
    renderApp(`/booking/${SHOWTIME_ID}`);
    await screen.findByRole('heading', { level: 1, name: 'Kodi Orbital 9' });
    await waitFor(() => {
      expect(window.localStorage.getItem(LOCATION_STORAGE_KEY)).toBe('prizren');
    });
    expect(screen.getAllByRole('button', { name: 'Kinemaja: Prizren' }).length).toBeGreaterThan(0);
  });

  it('shows a suite in 3D for looking only; it is booked as a whole', async () => {
    withWebGL(true);
    stubAuth(null, { seatmap: { [SUITE_SHOWTIME_ID]: suiteMap() } });
    renderApp(`/booking/${SUITE_SHOWTIME_ID}`);
    expect(await screen.findByRole('img', { name: 'Suita 4 në 3D' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rezervo gjithë suitën' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2D' }));
    expect(screen.queryByRole('img', { name: 'Suita 4 në 3D' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Ulëset në/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rezervo gjithë suitën' })).toBeInTheDocument();
  });
});
