import type { AdminPricesResponse } from '@kinemax/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCATION_STORAGE_KEY } from '../location/location-storage';
import { stubAdmin, superAdminUser } from '../test/admin';
import { renderApp } from '../test/catalog';

beforeAll(async () => {
  await import('./AdminApp');
});

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
});

const id = (n: string) => `0190f0a0-0000-7000-8000-0000000000${n}`;
const prices: AdminPricesResponse = {
  hallTypes: [{ id: id('a1'), code: 'STANDARD', nameSq: 'Standard', nameEn: null }],
  locations: [{ id: id('d1'), name: 'Kinemax Prizren' }],
  categories: [{ id: id('c1'), code: 'STUDENT', nameSq: 'Student', nameEn: null }],
  suites: [],
  base: [
    {
      id: id('b1'),
      validFrom: '2026-01-01T00:00:00.000Z',
      hallTypeId: id('a1'),
      locationId: null,
      priceCents: 450,
    },
  ],
  surcharge: [],
  discount: [],
  suite: [],
  adjustment: [],
};

function stubPrices() {
  const requests: { method: string; path: string; body: unknown }[] = [];
  stubAdmin(superAdminUser(), (req) => {
    requests.push(req);
    if (req.path === '/api/admin/prices') return prices;
    if (req.path === '/api/admin/settings') {
      return req.method === 'PUT'
        ? req.body
        : { seatHoldMinutes: 10, cancellationCutoffMinutes: 120 };
    }
    if (req.method === 'POST')
      return { status: req.path.endsWith('/end') ? 204 : 201, body: { id: id('b2') } };
    return undefined;
  });
  return requests;
}

describe('the prices page', () => {
  it('sets a new price version and saves the settings', async () => {
    const requests = stubPrices();
    renderApp('/admin/prices');
    const row = await screen.findByRole('row', { name: /Standard · Të gjitha kinematë/ });
    expect(within(row).getByText('4,50 €')).toBeInTheDocument();
    fireEvent.change(within(row).getByRole('textbox', { name: /^Vlera e re/ }), {
      target: { value: '5,20' },
    });
    fireEvent.click(within(row).getByRole('button', { name: /^Ruaj: Standard/ }));
    expect(await screen.findByText('U ruajt si version i ri.')).toBeInTheDocument();
    expect(requests.find((r) => r.path === '/api/admin/prices/base')?.body).toEqual({
      hallTypeId: id('a1'),
      locationId: null,
      priceCents: 520,
    });
    fireEvent.change(await screen.findByLabelText(/^Koha e mbajtjes/), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ruaj cilësimet' }));
    expect(await screen.findByText('Cilësimet u ruajtën.')).toBeInTheDocument();
    expect(requests.find((r) => r.method === 'PUT')?.body).toEqual({
      seatHoldMinutes: 15,
      cancellationCutoffMinutes: 120,
    });
  });

  it('refuses an invalid amount and states the impact before ending a rule', async () => {
    const requests = stubPrices();
    renderApp('/admin/prices');
    const row = await screen.findByRole('row', { name: /Standard · Të gjitha kinematë/ });
    fireEvent.change(within(row).getByRole('textbox', { name: /^Vlera e re/ }), {
      target: { value: 'abc' },
    });
    fireEvent.click(within(row).getByRole('button', { name: /^Ruaj: Standard/ }));
    expect(within(row).getByRole('alert')).toHaveTextContent('Shkruaj një shumë të vlefshme');
    fireEvent.click(within(row).getByRole('button', { name: /^Mbyll: Standard/ }));
    const dialog = screen.getByRole('dialog', { name: 'Të mbyllet ky rregull?' });
    expect(
      within(dialog).getByText(/biletat e këtij lloji salle nuk mund të blihen/),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Po, mbylle' }));
    expect(await screen.findByText('Rregulli u mbyll.')).toBeInTheDocument();
    expect(requests.some((r) => r.path === `/api/admin/prices/base/${id('b1')}/end`)).toBe(true);
    expect(requests.filter((r) => r.path === '/api/admin/prices/base')).toEqual([]);
  });
});
