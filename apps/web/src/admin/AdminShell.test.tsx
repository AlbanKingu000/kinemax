import { fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { testUser } from '../test/auth';
import { ADMIN_LOCATIONS, managerUser, stubAdmin, superAdminUser } from '../test/admin';
import { renderApp, urlOf } from '../test/catalog';
import { LOCATION_STORAGE_KEY } from '../location/location-storage';
import { ADMIN_LOCATION_KEY, initialAdminLocation } from './admin-location';

// The panel is a lazy chunk: load it once, so the first test does not spend its wait on it.
beforeAll(async () => {
  await import('./AdminApp');
});

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
});

const adminCalls = (state: ReturnType<typeof stubAdmin>) =>
  state.requests.filter((r) => r.path.startsWith('/api/admin/'));

describe('/admin for people who are not staff', () => {
  it.each([
    ['signed out', null],
    ['a customer', testUser()],
  ])('shows the ordinary not-found page to %s, without loading the panel', async (_who, user) => {
    const state = stubAdmin(user);
    renderApp('/admin/showtimes');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Faqja nuk u gjet' }),
    ).toBeInTheDocument();
    // The public shell, no admin navigation and no login redirect.
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Navigimi i administrimit' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Paneli admin' })).toBeNull();
    expect(adminCalls(state)).toEqual([]);
  });
});

describe('the admin shell', () => {
  it('gives a super admin the full sidebar, all cinemas and the way back', async () => {
    stubAdmin(superAdminUser());
    renderApp('/admin');
    const nav = await screen.findByRole('navigation', { name: 'Navigimi i administrimit' });
    for (const name of ['Dashboard', 'Filmat', 'Shfaqjet', 'Sallat', 'Çmimet']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    }
    // Later parts are listed, but not links yet.
    for (const name of ['Ushqimi', 'Skano', 'Përdoruesit']) {
      expect(within(nav).queryByRole('link', { name: new RegExp(name) })).toBeNull();
      expect(within(nav).getByText(name)).toBeInTheDocument();
    }
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const select = screen.getByRole('combobox', { name: 'Kinemaja' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Të gjitha', 'Kinemax Prishtina', 'Kinemax Prizren']);
    expect(select).toHaveValue('');
    expect(screen.getByRole('link', { name: 'Kthehu te site-i' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Kalo te përmbajtja' })).toHaveAttribute(
      'href',
      '#admin-main',
    );
    await vi.waitFor(() => {
      expect(document.title).toBe('Paneli i administrimit · Kinemax');
    });
  });

  it('remembers the chosen cinema', async () => {
    stubAdmin(superAdminUser());
    renderApp('/admin');
    const select = await screen.findByRole('combobox', { name: 'Kinemaja' });
    fireEvent.change(select, { target: { value: ADMIN_LOCATIONS[1]?.id } });
    expect(select).toHaveValue(ADMIN_LOCATIONS[1]?.id);
    expect(window.localStorage.getItem(ADMIN_LOCATION_KEY)).toBe(ADMIN_LOCATIONS[1]?.id);
    fireEvent.change(select, { target: { value: '' } });
    expect(window.localStorage.getItem(ADMIN_LOCATION_KEY)).toBeNull();
  });

  it('shows a manager only their cinema and no movie management', async () => {
    stubAdmin(managerUser());
    renderApp('/admin/movies');
    expect(await screen.findByRole('heading', { name: 'Faqja nuk u gjet' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Navigimi i administrimit' });
    expect(within(nav).queryByRole('link', { name: 'Filmat' })).toBeNull();
    const select = screen.getByRole('combobox', { name: 'Kinemaja' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Kinemax Prizren']);
    expect(screen.getByText('Menaxher kinemaje')).toBeInTheDocument();
  });

  it('opens the navigation as a drawer from the menu button', async () => {
    stubAdmin(managerUser());
    renderApp('/admin/halls');
    fireEvent.click(await screen.findByRole('button', { name: 'Hap menynë e administrimit' }));
    const dialog = screen.getByRole('dialog', { name: 'Administrimi' });
    fireEvent.click(within(dialog).getByRole('link', { name: 'Shfaqjet' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('heading', { level: 1, name: /Shfaqjet/ })).toBeInTheDocument();
  });

  it('offers the panel in the account menu to staff only', async () => {
    stubAdmin(managerUser());
    renderApp('/food');
    fireEvent.click(await screen.findByRole('button', { name: /^Llogaria e Menaxher/ }));
    expect(screen.getByRole('link', { name: 'Paneli admin' })).toHaveAttribute('href', '/admin');
  });

  it('says so when the cinemas cannot be loaded, with a retry', async () => {
    stubAdmin(superAdminUser(), () => undefined);
    const fetchMock = vi.mocked(fetch);
    const original = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((input, init) =>
      urlOf(input).includes('/api/admin/locations')
        ? Promise.resolve(new Response('{}', { status: 500 }))
        : (original?.(input, init) ?? Promise.reject(new Error('no fetch'))),
    );
    renderApp('/admin');
    expect(await screen.findByRole('heading', { name: 'Paneli nuk u ngarkua.' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Provo përsëri' })).toBeInTheDocument();
  });
});

describe('initialAdminLocation', () => {
  const [a, b] = ADMIN_LOCATIONS as [(typeof ADMIN_LOCATIONS)[0], (typeof ADMIN_LOCATIONS)[0]];
  it('keeps a stored cinema the user may still see, else "all" or the first own one', () => {
    expect(initialAdminLocation([a, b], true, b.id)).toBe(b.id);
    expect(initialAdminLocation([a, b], true, 'gone')).toBeNull();
    expect(initialAdminLocation([b], false, a.id)).toBe(b.id);
    expect(initialAdminLocation([], false, null)).toBeNull();
  });
});
