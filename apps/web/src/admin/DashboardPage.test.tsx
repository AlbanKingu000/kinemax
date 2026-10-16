import { fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_LOCATIONS,
  managerUser,
  stubAdmin,
  statsFixture,
  superAdminUser,
} from '../test/admin';
import { renderApp } from '../test/catalog';
import { LOCATION_STORAGE_KEY } from '../location/location-storage';

// The panel is a lazy chunk: load it once, so the first test does not spend its wait on it.
beforeAll(async () => {
  await import('./AdminApp');
});

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
});

/** Stubs the stats endpoint and records its queries. */
function stubStats(user = superAdminUser(), answer: () => unknown = () => statsFixture()) {
  const queries: URLSearchParams[] = [];
  stubAdmin(user, ({ path, url }) => {
    if (path !== '/api/admin/stats') return undefined;
    queries.push(url.searchParams);
    return answer();
  });
  return queries;
}

describe('the admin dashboard', () => {
  it('shows the key figures, the charts and the next shows', async () => {
    stubStats();
    renderApp('/admin');
    expect(await screen.findByText('144,50 €')).toBeInTheDocument();
    expect(screen.getByText(/Bileta 141,50 € · Ushqim 3,00 €/)).toBeInTheDocument();
    expect(screen.getByText(/Rimbursime të zbritura: 4,50 €/)).toBeInTheDocument();
    expect(screen.getByText('57%')).toBeInTheDocument();
    expect(screen.getByText('4 nga 7 ulëse')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Të ardhurat sipas ditës/ })).toBeInTheDocument();
    const types = screen.getByRole('list', { name: 'Shitjet sipas llojit të sallës' });
    expect(within(types).getAllByRole('listitem')).toHaveLength(2);
    expect(within(types).getByText('Suitë private')).toBeInTheDocument();
    const top = screen.getByRole('list', { name: 'Top 5 filmat' });
    expect(within(top).getByText('Fanari i heshtur')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Shfaqjet në 24 orët e ardhshme' });
    const row = within(table).getByRole('row', { name: /Fanari i heshtur/ });
    expect(within(row).getByText('3/12')).toBeInTheDocument();
    expect(within(row).getByRole('meter')).toHaveAttribute('aria-valuetext', '25%');
    // All cinemas: the cinema column is shown.
    expect(within(table).getByRole('columnheader', { name: 'Kinemaja' })).toBeInTheDocument();
  });

  it('asks again for another period and another cinema', async () => {
    const queries = stubStats();
    renderApp('/admin');
    await screen.findByText('144,50 €');
    expect(queries[0]?.get('range')).toBe('today');
    expect(queries[0]?.has('location')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '7 ditë' }));
    await vi.waitFor(() => {
      expect(queries.at(-1)?.get('range')).toBe('7d');
    });
    expect(screen.getByRole('button', { name: '7 ditë' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByRole('combobox', { name: 'Kinemaja' }), {
      target: { value: ADMIN_LOCATIONS[0]?.id },
    });
    await vi.waitFor(() => {
      expect(queries.at(-1)?.get('location')).toBe(ADMIN_LOCATIONS[0]?.id);
    });
    expect(await screen.findByText('Kinemaja: Kinemax Prishtina')).toBeInTheDocument();
  });

  it('asks a manager for their own cinema and hides the cinema column', async () => {
    const queries = stubStats(managerUser());
    renderApp('/admin');
    const table = await screen.findByRole('table', { name: 'Shfaqjet në 24 orët e ardhshme' });
    expect(queries[0]?.get('location')).toBe(ADMIN_LOCATIONS[1]?.id);
    expect(within(table).queryByRole('columnheader', { name: 'Kinemaja' })).toBeNull();
  });

  it('says when there is nothing yet, and offers a retry on errors', async () => {
    let fail = true;
    stubStats(superAdminUser(), () =>
      fail
        ? { status: 500, body: { error: { code: 'internal_error', message: 'x' } } }
        : statsFixture({ topMovies: [], upcoming: [] }),
    );
    renderApp('/admin');
    const retry = await screen.findByRole('button', { name: 'Provo përsëri' });
    fail = false;
    fireEvent.click(retry);
    expect(await screen.findByText('Asnjë shitje në këtë periudhë.')).toBeInTheDocument();
    expect(screen.getByText('Asnjë shfaqje në 24 orët e ardhshme.')).toBeInTheDocument();
  });
});
