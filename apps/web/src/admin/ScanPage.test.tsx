import type { CheckinResponse } from '@kinemax/shared';
import { fireEvent, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCATION_STORAGE_KEY } from '../location/location-storage';
import { ADMIN_LOCATIONS, managerUser, must, stubAdmin, superAdminUser } from '../test/admin';
import { renderApp } from '../test/catalog';

beforeAll(async () => {
  await import('./AdminApp');
});

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
});

const ok: CheckinResponse = {
  result: 'ok',
  already: false,
  checkedInAt: '2030-03-10T17:50:00.000Z',
  ticket: {
    code: 'ABCD1234EFGH5678',
    movieTitleSq: 'Fanari i Heshtur',
    movieTitleEn: null,
    ageRating: 'AGE_18',
    hallName: 'VIP 3',
    startsAt: '2030-03-10T18:00:00.000Z',
    timeZone: 'Europe/Belgrade',
    wholeHall: false,
    seats: ['A3', 'A4'],
    food: [{ nameSq: 'Kokoshka', nameEn: 'Popcorn', quantity: 2 }],
  },
};

function stubScan(answers: CheckinResponse[]) {
  const requests: unknown[] = [];
  stubAdmin(managerUser(), (req) => {
    if (req.path !== '/api/admin/checkin') return undefined;
    requests.push(req.body);
    return answers.shift();
  });
  return requests;
}

function enter(code: string) {
  fireEvent.change(screen.getByLabelText(/^Kodi i biletës/), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Kontrollo' }));
}

describe('the scan page', () => {
  it('checks a typed code in and shows seats, food and the 18+ warning', async () => {
    const requests = stubScan([ok]);
    renderApp('/admin/scan');
    // No camera in jsdom (as on plain http): the page says so and keeps manual entry.
    fireEvent.click(await screen.findByRole('button', { name: 'Hap kamerën' }));
    expect(await screen.findByText(/vetëm në https ose në localhost/)).toBeInTheDocument();

    enter('abcd 1234 efgh 5678');
    const card = must((await screen.findByText('Hyrje e lejuar')).parentElement);
    expect(card).toHaveAttribute('data-tone', 'success');
    expect(card).toHaveTextContent('18+ – kontrollo dokumentin');
    expect(card).toHaveTextContent('VIP 3 · 19:00');
    expect(card).toHaveTextContent('A3, A4');
    expect(card).toHaveTextContent('2× Kokoshka');
    expect(requests).toEqual([
      { code: 'ABCD1234EFGH5678', locationId: ADMIN_LOCATIONS[1]?.id ?? '' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Skano tjetrën' }));
    expect(screen.getByLabelText(/^Kodi i biletës/)).toHaveValue('');
  });

  it('shows the reason in red when a ticket is refused', async () => {
    stubScan([
      {
        result: 'rejected',
        reason: 'too_early',
        startsAt: '2030-03-10T18:00:00.000Z',
        timeZone: 'Europe/Belgrade',
      },
    ]);
    renderApp('/admin/scan');
    await screen.findByLabelText(/^Kodi i biletës/);
    enter('ABCD1234EFGH5678');
    const card = await screen.findByRole('alert');
    expect(card).toHaveAttribute('data-tone', 'error');
    expect(card).toHaveTextContent('Hyrja nuk lejohet');
    expect(card).toHaveTextContent(/Shumë herët: hyrja hapet 90 minuta.*19:00/);
  });

  it('shows a repeat scan in amber, a whole suite, and a failed check', async () => {
    stubScan([
      {
        ...ok,
        already: true,
        ticket: { ...ok.ticket, ageRating: 'AGE_15', wholeHall: true, food: [] },
      },
      { result: 'rejected', reason: 'cancelled', startsAt: null, timeZone: null },
    ]);
    renderApp('/admin/scan');
    await screen.findByLabelText(/^Kodi i biletës/);
    enter('ABCD1234EFGH5678');
    const card = must((await screen.findByText(/^Tashmë e skanuar në 18:50/)).parentElement);
    expect(card).toHaveAttribute('data-tone', 'warning');
    expect(card).toHaveTextContent('15+ – kontrollo dokumentin');
    expect(card).toHaveTextContent('Suita e plotë');
    expect(card).not.toHaveTextContent('banak');

    fireEvent.click(screen.getByRole('button', { name: 'Skano tjetrën' }));
    enter('ABCD1234EFGH5679');
    expect(await screen.findByRole('alert')).toHaveTextContent('anuluar dhe rimbursuar');
    fireEvent.click(screen.getByRole('button', { name: 'Skano tjetrën' }));
    // No answer left: the request fails and the code stays for another try.
    enter('ABCD1234EFGH5670');
    expect(await screen.findByRole('alert')).toHaveTextContent('Kontrolli nuk u krye');
    expect(screen.getByLabelText(/^Kodi i biletës/)).toHaveValue('ABCD1234EFGH5670');
  });

  it('asks a super admin to pick one cinema first', async () => {
    window.localStorage.removeItem(LOCATION_STORAGE_KEY);
    stubAdmin(superAdminUser());
    renderApp('/admin/scan');
    expect(await screen.findByText(/Zgjidh kineman ku je/)).toBeInTheDocument();
  });
});
