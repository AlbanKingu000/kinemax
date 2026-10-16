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

  it('sets discounts, adds and edits time windows, and says when a save fails', async () => {
    const full: AdminPricesResponse = {
      ...prices,
      suites: [{ id: id('e1'), name: 'Suita 1', locationName: 'Kinemax Prizren' }],
      surcharge: [
        { id: id('f1'), validFrom: '2026-01-01T00:00:00.000Z', seatType: 'VIP', amountCents: 200 },
      ],
      discount: [
        {
          id: id('f2'),
          validFrom: '2026-01-01T00:00:00.000Z',
          ticketCategoryId: id('c1'),
          kind: 'PERCENT',
          value: 20,
        },
      ],
      adjustment: [
        {
          id: id('f3'),
          validFrom: '2026-02-01T00:00:00.000Z',
          locationId: id('d1'),
          nameSq: 'Fundjava',
          nameEn: null,
          daysOfWeek: [6, 7],
          startMinute: 1080,
          endMinute: 1440,
          kind: 'FIXED_CENTS',
          value: 100,
          priority: 1,
        },
        {
          id: id('f4'),
          validFrom: '2026-02-01T00:00:00.000Z',
          locationId: null,
          nameSq: 'Matine',
          nameEn: 'Matinee',
          daysOfWeek: [1],
          startMinute: 600,
          endMinute: 840,
          kind: 'PERCENT',
          value: -20,
          priority: 0,
        },
      ],
    };
    const requests: { method: string; path: string; body: unknown }[] = [];
    stubAdmin(superAdminUser(), (req) => {
      requests.push(req);
      if (req.path === '/api/admin/prices') return full;
      if (req.path === '/api/admin/settings') {
        return req.method === 'PUT'
          ? { status: 500, body: { error: { code: 'internal', message: 'x' } } }
          : { seatHoldMinutes: 10, cancellationCutoffMinutes: 120 };
      }
      if (req.path === '/api/admin/prices/suite') {
        return { status: 409, body: { error: { code: 'conflict', message: 'x' } } };
      }
      return { status: req.method === 'POST' ? 201 : 200, body: { id: id('b2') } };
    });
    renderApp('/admin/prices');

    const weekend = await screen.findByRole('row', { name: /Fundjava/ });
    expect(weekend).toHaveTextContent('Sht Die, 18:00–24:00');
    expect(weekend).toHaveTextContent('+1,00');
    expect(weekend).toHaveTextContent('Kinemax Prizren');
    expect(screen.getByRole('row', { name: /Matine/ })).toHaveTextContent('-20%');
    expect(screen.getByRole('row', { name: /^VIP/ })).toHaveTextContent('2,00 €');

    // A discount as a fixed amount instead of a percent.
    const student = screen.getByRole('row', { name: /^Student/ });
    expect(student).toHaveTextContent('20%');
    fireEvent.change(within(student).getByRole('combobox', { name: 'Lloji' }), {
      target: { value: 'FIXED_CENTS' },
    });
    fireEvent.change(within(student).getByRole('textbox'), { target: { value: '1,50' } });
    fireEvent.click(within(student).getByRole('button', { name: 'Ruaj: Student' }));
    await vi.waitFor(() => {
      expect(requests.find((r) => r.path === '/api/admin/prices/discount')?.body).toEqual({
        ticketCategoryId: id('c1'),
        kind: 'FIXED_CENTS',
        value: 150,
      });
    });

    // A refused suite price shows the error in its row.
    // The page reloads after a save.
    expect(await screen.findByText('U ruajt si version i ri.')).toBeInTheDocument();
    const suite = await screen.findByRole('row', { name: /Suita 1/ });
    fireEvent.change(within(suite).getByRole('textbox'), { target: { value: '60' } });
    fireEvent.click(within(suite).getByRole('button', { name: /^Ruaj: Suita 1/ }));
    expect(await within(suite).findByRole('alert')).toHaveTextContent('nuk u ruajt');

    // A new time window: incomplete first, then complete (00:00 = end of the day).
    fireEvent.click(screen.getByRole('button', { name: 'Shto ndryshim orari' }));
    let dialog = screen.getByRole('dialog', { name: 'Ndryshim sipas ditës dhe orës' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ruaj' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Zgjidh të paktën një ditë');
    fireEvent.change(within(dialog).getByLabelText(/^Emri \(shqip\)/), {
      target: { value: 'Natë' },
    });
    fireEvent.click(within(dialog).getByLabelText('Pre'));
    fireEvent.click(within(dialog).getByLabelText('Sht'));
    fireEvent.click(within(dialog).getByLabelText('Sht'));
    fireEvent.change(within(dialog).getByLabelText(/^Nga ora/), { target: { value: '22:00' } });
    fireEvent.change(within(dialog).getByLabelText(/^Deri në orën/), {
      target: { value: '00:00' },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Kinemaja/), { target: { value: id('d1') } });
    fireEvent.change(within(dialog).getByLabelText(/^Vlera/), { target: { value: '-15' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ruaj' }));
    await vi.waitFor(() => {
      expect(requests.find((r) => r.path === '/api/admin/prices/adjustment')?.body).toEqual({
        locationId: id('d1'),
        nameSq: 'Natë',
        nameEn: '',
        daysOfWeek: [5],
        startMinute: 1320,
        endMinute: 1440,
        kind: 'PERCENT',
        value: -15,
        priority: 0,
      });
    });

    // Editing the weekend rule keeps its euros and sends a PUT.
    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    const edited = await screen.findByRole('row', { name: /Fundjava/ });
    fireEvent.click(within(edited).getByRole('button', { name: 'Ndrysho' }));
    dialog = screen.getByRole('dialog', { name: 'Ndryshim sipas ditës dhe orës' });
    expect(within(dialog).getByLabelText(/^Vlera/)).toHaveValue('1,00');
    fireEvent.change(within(dialog).getByLabelText(/^Prioriteti/), { target: { value: '3' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ruaj' }));
    await vi.waitFor(() => {
      expect(
        requests.find((r) => r.method === 'PUT' && r.path.includes(id('f3')))?.body,
      ).toMatchObject({
        kind: 'FIXED_CENTS',
        value: 100,
        priority: 3,
        startMinute: 1080,
        endMinute: 1440,
      });
    });

    // Ending a time window, and a settings save that fails.
    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Mbyll: Matine' }));
    const confirm = screen.getByRole('dialog', { name: 'Të mbyllet ky rregull?' });
    expect(confirm).toHaveTextContent('nuk do të vlejë më');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Po, mbylle' }));
    await vi.waitFor(() => {
      expect(requests.some((r) => r.path === `/api/admin/prices/adjustment/${id('f4')}/end`)).toBe(
        true,
      );
    });
    expect(await screen.findByText('Rregulli u mbyll.')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Ruaj cilësimet' }));
    expect(
      await screen.findByText('Ndryshimi nuk u ruajt. Provo përsëri.', {
        selector: '[role=alert]',
      }),
    ).toBeInTheDocument();
  });
});
