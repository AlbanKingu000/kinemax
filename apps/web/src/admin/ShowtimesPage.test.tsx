import type { AdminShowtime, AdminShowtimesResponse } from '@kinemax/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_LOCATIONS, managerUser, stubAdmin, superAdminUser } from '../test/admin';
import { renderApp } from '../test/catalog';
import { LOCATION_STORAGE_KEY } from '../location/location-storage';
import { todayIn } from '../i18n/format';
import { dateRange, parseTimes } from './bulk-slots';

// The panel is a lazy chunk: load it once, so the first test does not spend its wait on it.
beforeAll(async () => {
  await import('./AdminApp');
});

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
});

const TZ = 'Europe/Belgrade';
const HALL = '0190f0a0-0000-7000-8000-0000000000f1';
const SUITE = '0190f0a0-0000-7000-8000-0000000000f2';
const MOVIE = '0190f0a0-0000-7000-8000-00000000d001';
const today = todayIn(TZ);

/** 18:00 local today as an instant (the browser's zone may differ from the cinema's). */
const local = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  const guess = new Date(`${today}T${time}:00Z`);
  const shown = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(guess);
  const [sh, sm] = shown.split(':').map(Number);
  return new Date(
    guess.getTime() - ((sh ?? 0) * 60 + (sm ?? 0) - ((h ?? 0) * 60 + (m ?? 0))) * 60_000,
  );
};

const show = (overrides: Partial<AdminShowtime> = {}): AdminShowtime => ({
  id: '0190f0a0-0000-7000-8000-0000000000a1',
  movieId: MOVIE,
  movieTitleSq: 'Fanari i Heshtur',
  movieTitleEn: 'The Silent Lighthouse',
  hallId: HALL,
  hallName: 'Salla 1',
  startsAt: local('18:00').toISOString(),
  endsAt: local('20:12').toISOString(),
  format: '2D',
  languageVersion: 'DUBBED_SQ',
  isActive: true,
  isPast: false,
  soldTickets: 3,
  activeBookings: 3,
  paidBookings: 2,
  refundCents: 1350,
  ...overrides,
});

const day = (showtimes: AdminShowtime[] = [show()]): AdminShowtimesResponse => ({
  timeZone: TZ,
  date: today,
  cleaningBufferMinutes: 20,
  halls: [
    {
      id: HALL,
      name: 'Salla 1',
      hallTypeNameSq: 'Standard',
      hallTypeNameEn: null,
      wholeHallOnly: false,
    },
    {
      id: SUITE,
      name: 'Suita 4',
      hallTypeNameSq: 'Suitë private',
      hallTypeNameEn: null,
      wholeHallOnly: true,
    },
  ],
  movies: [{ id: MOVIE, titleSq: 'Fanari i Heshtur', titleEn: null, durationMinutes: 112 }],
  showtimes,
});

interface Req {
  method: string;
  path: string;
  url: URL;
  body: unknown;
}

function stubShowtimes(handle: (req: Req) => unknown = () => undefined, user = managerUser()) {
  const requests: Req[] = [];
  stubAdmin(user, (req) => {
    requests.push(req);
    const custom = handle(req);
    if (custom !== undefined) return custom;
    if (req.method === 'GET' && req.path === '/api/admin/showtimes') return day();
    return undefined;
  });
  return requests;
}

describe('the showtimes page', () => {
  it('asks a super admin to choose one cinema first', async () => {
    stubShowtimes(() => undefined, superAdminUser());
    renderApp('/admin/showtimes');
    expect(await screen.findByRole('heading', { name: 'Zgjidh një kinema' })).toBeInTheDocument();
  });

  it('lists the day per hall and moves between days', async () => {
    const requests = stubShowtimes();
    renderApp('/admin/showtimes');
    const hall = await screen.findByRole('region', { name: 'Salla 1 Standard' });
    const row = within(hall).getByRole('row', { name: /Fanari i Heshtur/ });
    expect(within(row).getByText('18:00–20:12')).toBeInTheDocument();
    expect(within(row).getByText('2D · Dublim shqip')).toBeInTheDocument();
    expect(within(row).getByText('Aktive')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Suita 4 Suitë private' })).getByText(
        'Asnjë shfaqje këtë ditë.',
      ),
    ).toBeInTheDocument();
    expect(requests[0]?.url.searchParams.get('location')).toBe(ADMIN_LOCATIONS[1]?.id);
    expect(requests[0]?.url.searchParams.get('date')).toBe(today);
    fireEvent.click(screen.getByRole('button', { name: 'Dita tjetër' }));
    await vi.waitFor(() => {
      expect(requests.at(-1)?.url.searchParams.get('date')).not.toBe(today);
    });
  });

  it('creates a show, shows the computed end and explains an overlap', async () => {
    let attempts = 0;
    const requests = stubShowtimes((req) => {
      if (req.method !== 'POST' || req.path !== '/api/admin/showtimes') return undefined;
      attempts += 1;
      return attempts === 1
        ? { status: 409, body: { error: { code: 'conflict', message: 'x' } } }
        : { status: 201, body: { showtime: show({ id: '0190f0a0-0000-7000-8000-0000000000a2' }) } };
    });
    renderApp('/admin/showtimes');
    fireEvent.click(await screen.findByRole('button', { name: 'Shfaqje e re' }));
    const dialog = screen.getByRole('dialog', { name: 'Shfaqje e re' });
    fireEvent.change(within(dialog).getByLabelText(/^Filmi/), { target: { value: MOVIE } });
    fireEvent.change(within(dialog).getByLabelText(/^Ora e fillimit/), {
      target: { value: '21:00' },
    });
    expect(
      within(dialog).getByText('Mbaron në 23:12 (filmi 112 min + 20 min pastrim).'),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Krijo shfaqjen' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Salla është e zënë/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Krijo shfaqjen' }));
    expect(await screen.findByText('Shfaqja u krijua.')).toBeInTheDocument();
    expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
      movieId: MOVIE,
      hallId: HALL,
      date: today,
      time: '21:00',
      format: '2D',
      languageVersion: 'ORIGINAL_SQ_SUBTITLES',
    });
  });

  it('locks every field once tickets are sold and points to deactivate + new', async () => {
    stubShowtimes();
    renderApp('/admin/showtimes');
    fireEvent.click(
      await screen.findByRole('button', { name: /^Ndrysho shfaqjen Fanari i Heshtur/ }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Ndrysho shfaqjen' });
    expect(
      within(dialog).getByText(
        'Kjo shfaqje ka bileta të shitura: për ndryshime çaktivizoje dhe krijo një të re.',
      ),
    ).toBeInTheDocument();
    for (const label of [/^Filmi/, /^Salla/, /^Data/, /^Ora e fillimit/, /^Formati/, /^Versioni/]) {
      expect(within(dialog).getByLabelText(label)).toBeDisabled();
    }
    expect(within(dialog).queryByRole('button', { name: 'Ruaj' })).toBeNull();
  });

  it('deactivates after a dialog that states the refunds and cancellations', async () => {
    const requests = stubShowtimes((req) =>
      req.path.endsWith('/deactivate')
        ? {
            showtime: show({ isActive: false, activeBookings: 0 }),
            cancelledBookings: 1,
            refundedBookings: 2,
            refundedCents: 1350,
          }
        : undefined,
    );
    renderApp('/admin/showtimes');
    fireEvent.click(
      await screen.findByRole('button', { name: /^Çaktivizo shfaqjen Fanari i Heshtur/ }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Të çaktivizohet shfaqja?' });
    expect(
      within(dialog).getByText('3 bileta do të anulohen dhe rimbursohen (13,50 €, demo).'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('1 rezervim i papaguar do të anulohet.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Anulo' })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Po, çaktivizoje' }));
    expect(
      await screen.findByText('Shfaqja u çaktivizua. Rimbursime: 2, rezervime të anuluara: 1.'),
    ).toBeInTheDocument();
    expect(requests.filter((r) => r.path.endsWith('/deactivate'))).toHaveLength(1);
  });

  it('previews a bulk plan and creates only the free slots', async () => {
    const requests = stubShowtimes((req) => {
      if (req.path === '/api/admin/showtimes/bulk/preview') {
        const slot = (time: string, status: string) => ({
          date: today,
          time,
          startsAt: local(time).toISOString(),
          endsAt: new Date(local(time).getTime() + 132 * 60_000).toISOString(),
          status,
          conflicts:
            status === 'conflict'
              ? [
                  {
                    showtimeId: show().id,
                    movieTitleSq: 'Fanari i Heshtur',
                    movieTitleEn: null,
                    startsAt: show().startsAt,
                    endsAt: show().endsAt,
                  },
                ]
              : [],
        });
        return { slots: [slot('14:00', 'ok'), slot('18:00', 'conflict')] };
      }
      if (req.path === '/api/admin/showtimes/bulk') return { status: 201, body: { created: 1 } };
      return undefined;
    });
    renderApp('/admin/showtimes');
    fireEvent.click(await screen.findByRole('button', { name: 'Shto në grup' }));
    const dialog = screen.getByRole('dialog', { name: 'Shto shfaqje në grup' });
    fireEvent.change(within(dialog).getByLabelText(/^Filmi/), { target: { value: MOVIE } });
    fireEvent.change(within(dialog).getByLabelText(/^Deri më/), { target: { value: today } });
    fireEvent.change(within(dialog).getByLabelText(/^Oraret/), {
      target: { value: '18:00, 14:00' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Shiko paraprakisht' }));
    const table = await within(dialog).findByRole('table', { name: 'Shfaqjet që do të krijohen' });
    expect(within(table).getByText('Përplasje')).toBeInTheDocument();
    expect(within(table).getByText('me Fanari i Heshtur (18:00–20:12)')).toBeInTheDocument();
    const boxes = within(table).getAllByRole('checkbox');
    expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([true, false]);
    expect(boxes[1]).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Krijo 1 shfaqje' }));
    expect(await screen.findByText('U krijua 1 shfaqje.')).toBeInTheDocument();
    expect(
      requests.find((r) => r.path === '/api/admin/showtimes/bulk/preview')?.body,
    ).toMatchObject({
      slots: [
        { date: today, time: '14:00' },
        { date: today, time: '18:00' },
      ],
    });
    expect(requests.find((r) => r.path === '/api/admin/showtimes/bulk')?.body).toMatchObject({
      slots: [{ date: today, time: '14:00' }],
    });
  });
});

describe('bulk slot helpers', () => {
  it('reads times in any order and rejects anything that is not a time', () => {
    expect(parseTimes('21:00, 9:30;14:00 21:00')).toEqual(['09:30', '14:00', '21:00']);
    expect(parseTimes('14:00, 25:00')).toBeNull();
    expect(parseTimes('  ')).toBeNull();
  });

  it('builds date ranges of up to 14 days', () => {
    expect(dateRange('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(dateRange('2026-11-02', '2026-10-30')).toBeNull();
    expect(dateRange('2026-11-01', '2026-11-15')).toBeNull();
  });
});
