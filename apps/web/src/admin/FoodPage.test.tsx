import type { AdminMenuItem, DeliveriesResponse } from '@kinemax/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCATION_STORAGE_KEY } from '../location/location-storage';
import { ADMIN_LOCATIONS, managerUser, stubAdmin, superAdminUser } from '../test/admin';
import { renderApp } from '../test/catalog';

beforeAll(async () => {
  await import('./AdminApp');
});

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
});

const id = (n: string) => `0190f0a0-0000-7000-8000-0000000000${n}`;
const popcorn: AdminMenuItem = {
  id: id('e1'),
  slug: 'kokoshka',
  nameSq: 'Kokoshka',
  nameEn: 'Popcorn',
  descriptionSq: null,
  descriptionEn: null,
  category: 'POPCORN',
  imagePath: null,
  isCombo: false,
  isActive: true,
  components: [],
  hasOrders: true,
  offer: { priceCents: 350, isAvailable: true },
};
const deliveries: DeliveriesResponse = {
  timeZone: 'Europe/Belgrade',
  orders: [
    {
      bookingId: id('b1'),
      code: 'ABCD1234EFGH5678',
      serveTiming: 'DURING_SHOW',
      dueAt: '2030-03-10T14:20:00.000Z',
      startsAt: '2030-03-10T14:00:00.000Z',
      movieTitleSq: 'Fanari i Heshtur',
      movieTitleEn: null,
      hallName: 'VIP 3',
      seats: ['A3', 'A4'],
      items: [{ nameSq: 'Kokoshka', nameEn: 'Popcorn', quantity: 2 }],
      deliveredAt: null,
    },
  ],
};

function stubFood(
  user = managerUser(),
  onWrite: (req: { method: string; path: string; body: unknown }) => unknown = () => undefined,
) {
  const requests: { method: string; path: string; body: unknown }[] = [];
  stubAdmin(user, (req) => {
    requests.push(req);
    const custom = onWrite(req);
    if (custom !== undefined) return custom;
    if (req.path === '/api/admin/menu' && req.method === 'GET') return { items: [popcorn] };
    if (req.path === '/api/admin/deliveries') return deliveries;
    if (req.method === 'PUT') return { item: popcorn };
    if (req.path.endsWith('/delivered')) return { delivered: 1 };
    return undefined;
  });
  return requests;
}

describe('the food page', () => {
  it('lets a manager price an item and mark a seat delivery as delivered', async () => {
    const requests = stubFood();
    renderApp('/admin/food');
    const row = await screen.findByRole('row', { name: /Kokoshka/ });
    fireEvent.change(within(row).getByLabelText('Çmimi: Kokoshka'), { target: { value: '3,80' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Ruaj ofertën: Kokoshka' }));
    expect(await screen.findByText('U ruajt.')).toBeInTheDocument();
    expect(requests.find((r) => r.method === 'PUT')).toMatchObject({
      path: `/api/admin/menu/${id('e1')}/locations/${ADMIN_LOCATIONS[1]?.id ?? ''}`,
      body: { isAvailable: true, priceCents: 380 },
    });
    // The manager cannot edit the global menu.
    expect(screen.queryByRole('button', { name: 'Shto artikull' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Dorëzimet sot' }));
    const order = await screen.findByRole('row', { name: /A3, A4/ });
    expect(within(order).getByText('Gjatë filmit (~20 min)')).toBeInTheDocument();
    expect(within(order).getByText('2× Kokoshka')).toBeInTheDocument();
    fireEvent.click(within(order).getByRole('button', { name: /^Dorëzuar: A3, A4 në 15:20/ }));
    await vi.waitFor(() => {
      expect(requests.find((r) => r.path.endsWith('/delivered'))?.body).toEqual({
        serveTiming: 'DURING_SHOW',
      });
    });
  });

  it('shows a clear error when a new item is refused, and refuses a bad price', async () => {
    stubFood(superAdminUser(), (req) =>
      req.method === 'POST' && req.path === '/api/admin/menu'
        ? { status: 400, body: { error: { code: 'validation_failed', message: 'x' } } }
        : undefined,
    );
    renderApp('/admin/food');
    fireEvent.click(await screen.findByRole('button', { name: 'Shto artikull' }));
    const dialog = screen.getByRole('dialog', { name: 'Artikull i ri' });
    fireEvent.change(within(dialog).getByLabelText(/^Kategoria/), { target: { value: 'COMBO' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ruaj' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Kontrollo fushat');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anulo' }));
    // "Të gjitha" is chosen for a super admin: no per-cinema price column.
    expect(screen.queryByLabelText('Çmimi: Kokoshka')).toBeNull();
  });
});
