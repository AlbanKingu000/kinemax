import { HALL_TYPE_SPACING, type HallLayoutResponse, type SeatMapResponse } from '@kinemax/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_LOCATIONS, managerUser, must, stubAdmin } from '../test/admin';
import { renderApp } from '../test/catalog';
import { LOCATION_STORAGE_KEY } from '../location/location-storage';

// The 3D hall needs WebGL; a stand-in shows what it would draw.
vi.mock('../booking/Hall3D', () => ({
  default: ({ map, label }: { map: SeatMapResponse; label: string }) => (
    <p>
      {label}: {map.seats.filter((s) => s.status === 'AVAILABLE').length} ulëse në 3D
    </p>
  ),
}));

beforeAll(async () => {
  await import('./AdminApp');
});

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
});

const HALL = '0190f0a0-0000-7000-8000-0000000000ff';
const id = (n: string) => `0190f0a0-0000-7000-8000-0000000000${n}`;
const blocker = {
  showtimeId: '0190f0a0-0000-7000-8000-00000000aaaa',
  startsAt: '2026-10-22T11:00:00.000Z',
  movieTitleSq: 'Pipa dhe Robotët',
  movieTitleEn: null,
};
const seat = (n: string, extra: object = {}) => ({
  id: id(n),
  type: 'STANDARD' as const,
  isActive: true,
  hasHistory: false,
  blockedBy: [],
  ...extra,
});
const layout = (): HallLayoutResponse => ({
  hall: {
    id: HALL,
    name: 'Salla 1',
    locationId: ADMIN_LOCATIONS[1]?.id ?? '',
    wholeHallOnly: false,
    hallType: { code: 'STANDARD', nameSq: 'Standard', nameEn: null },
    screen: { widthM: 12, heightM: 5, x: 0, y: 0, z: 3.5 },
  },
  spacing: must(HALL_TYPE_SPACING.STANDARD),
  rows: [
    {
      label: 'A',
      blocks: [[seat('a1'), seat('a2'), seat('a3', { blockedBy: [blocker] }), seat('a4')]],
    },
    { label: 'B', blocks: [[seat('b1'), seat('b2', { hasHistory: true })]] },
  ],
});

interface Req {
  method: string;
  path: string;
  body: unknown;
}

function stubEditor(onSave: (req: Req) => unknown = () => ({ ...layout() })) {
  const requests: Req[] = [];
  stubAdmin(managerUser(), (req) => {
    requests.push(req);
    if (req.path === '/api/admin/halls') {
      return {
        halls: [
          {
            id: HALL,
            name: 'Salla 1',
            hallTypeCode: 'STANDARD',
            hallTypeNameSq: 'Standard',
            hallTypeNameEn: null,
            wholeHallOnly: false,
            isActive: true,
            activeSeats: 6,
            inactiveSeats: 1,
          },
        ],
      };
    }
    if (req.path === `/api/admin/halls/${HALL}/layout`) {
      return req.method === 'PUT' ? onSave(req) : layout();
    }
    return undefined;
  });
  return requests;
}

const seatButton = (name: RegExp) => screen.getByRole('button', { name });

describe('the halls list', () => {
  it('lists the cinema’s halls with their seats and a link to the editor', async () => {
    stubEditor();
    renderApp('/admin/halls');
    const row = await screen.findByRole('row', { name: /Salla 1/ });
    expect(within(row).getByText('6 aktive · 1 joaktive')).toBeInTheDocument();
    expect(
      within(row).getByRole('link', { name: 'Ndrysho ulëset e sallës Salla 1' }),
    ).toHaveAttribute('href', `/admin/halls/${HALL}`);
  });
});

describe('the seat editor', () => {
  it('selects seats by click and Shift range, and refuses to remove a sold seat', async () => {
    stubEditor();
    renderApp(`/admin/halls/${HALL}`);
    expect(await screen.findByText(/2 rreshta · 6 ulëse aktive/)).toBeInTheDocument();
    fireEvent.click(seatButton(/^Rreshti A, ulësja 1,/));
    fireEvent.click(seatButton(/^Rreshti A, ulësja 3,/), { shiftKey: true });
    expect(screen.getByText('3 ulëse të zgjedhura')).toBeInTheDocument();
    // The blocking show is listed for the selected sold seat.
    const panel = screen.getByRole('complementary', { name: /rezervime për shfaqje/ });
    expect(within(panel).getByText(/Pipa dhe Robotët, 22 tetor 2026 13:00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hiq / çaktivizo' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Këto ulëse kanë rezervime për shfaqje që s’kanë mbaruar dhe nuk ndryshohen: A3.',
    );
    // A1 and A2 were never booked: gone; the sold seat stays (and is now number 1).
    expect(screen.getByText(/2 rreshta · 4 ulëse aktive/)).toBeInTheDocument();
    expect(
      seatButton(/^Rreshti A, ulësja 1, Standard, e rezervuar për 1 shfaqje/),
    ).toBeInTheDocument();
    expect(screen.getByText('Ka ndryshime të paruajtura.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rikthe si ishte' }));
    expect(screen.getByText(/2 rreshta · 6 ulëse aktive/)).toBeInTheDocument();
  });

  it('deactivates a seat with history, adds a row and saves one batch', async () => {
    const requests = stubEditor();
    renderApp(`/admin/halls/${HALL}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Rreshti B, ulësja 2,/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Hiq / çaktivizo' }));
    expect(
      seatButton(/^Rreshti B, ulësja 2, Standard, joaktive, e rezervuar më parë/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aktivizo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hiq / çaktivizo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Shto rresht' }));
    expect(screen.getByText(/3 rreshta · 7 ulëse aktive · 1 joaktive/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ruaj paraqitjen' }));
    expect(await screen.findByText('Paraqitja u ruajt.')).toBeInTheDocument();
    const put = requests.find((r) => r.method === 'PUT');
    expect(put?.body).toMatchObject({
      rows: [
        { label: 'A' },
        {
          label: 'B',
          blocks: [
            [
              { id: id('b1'), type: 'STANDARD', isActive: true },
              { id: id('b2'), type: 'STANDARD', isActive: false },
            ],
          ],
        },
        {
          label: 'C',
          blocks: [
            [
              { type: 'STANDARD', isActive: true },
              { type: 'STANDARD', isActive: true },
            ],
          ],
        },
      ],
    });
  });

  it('changes types, renames a row and adds a seat to the right', async () => {
    const requests = stubEditor();
    renderApp(`/admin/halls/${HALL}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Rreshti B, ulësja 1,/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Lloji i ulëses' }), {
      target: { value: 'COUPLE' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ndrysho llojin' }));
    expect(seatButton(/^Rreshti B, ulësja 1, Divan për dy/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Emri i rreshtit' }), {
      target: { value: 'a' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Riemërto' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Ky rresht ekziston tashmë.');
    fireEvent.change(screen.getByRole('textbox', { name: 'Emri i rreshtit' }), {
      target: { value: 'k' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Riemërto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Shto ulëse djathtas' }));
    expect(seatButton(/^Rreshti K, ulësja 2, Standard/)).toBeInTheDocument();
    // A sofa may not replace a seat with booking history.
    fireEvent.click(seatButton(/^Rreshti K, ulësja 3,/));
    fireEvent.click(screen.getByRole('button', { name: 'Ndrysho llojin' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/janë rezervuar më parë.*K3/);
    expect(requests.filter((r) => r.method === 'PUT')).toEqual([]);
  });

  it('explains a refusal from the server with the seats it names', async () => {
    stubEditor(() => ({
      status: 409,
      body: {
        error: {
          code: 'conflict',
          message: 'x',
          fields: [{ path: `seats.${id('a3')}`, code: 'blocked' }],
        },
      },
    }));
    renderApp(`/admin/halls/${HALL}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Shto rresht' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ruaj paraqitjen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/nuk ndryshohen: A3\./);
  });

  it('shows the hall in 3D with the edited seats', async () => {
    stubEditor();
    renderApp(`/admin/halls/${HALL}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Shfaq pamjen 3D' }));
    expect(await screen.findByText('Pamja 3D e sallës Salla 1: 6 ulëse në 3D')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Shto rresht' }));
    expect(await screen.findByText('Pamja 3D e sallës Salla 1: 8 ulëse në 3D')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fshih pamjen 3D' }));
    expect(screen.queryByText(/ulëse në 3D/)).toBeNull();
  });
});
