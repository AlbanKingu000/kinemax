import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCATION_STORAGE_KEY } from '../../location/location-storage';
import { renderApp, stubCatalog } from '../../test/catalog';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
  stubCatalog();
});

const header = () => screen.getByRole('banner');

describe('SiteHeader', () => {
  it('has the logo, the main sections with an active state, cinema, language, sign in and tickets', async () => {
    renderApp('/movies/some-movie');
    const nav = within(header()).getByRole('navigation', { name: 'Navigimi kryesor' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      'Filmat',
      'Orari',
      'Përvojat',
      'Lokacionet',
      'Ushqimi',
    ]);
    expect(within(nav).getByRole('link', { name: 'Filmat' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Orari' })).not.toHaveAttribute('aria-current');
    expect(within(header()).getByRole('link', { name: 'Kinemax, faqja kryesore' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(
      await within(header()).findByRole('button', { name: 'Kinemaja: Prizren' }),
    ).toHaveAttribute('aria-haspopup', 'dialog');
    expect(within(header()).getByRole('link', { name: 'Hyr' })).toHaveAttribute('href', '/login');
    expect(within(header()).getByRole('link', { name: 'Bli biletë' })).toHaveAttribute(
      'href',
      '/schedule',
    );
  });

  it('is transparent over the home hero until the page scrolls, and solid elsewhere', () => {
    const { unmount } = renderApp('/');
    expect(header()).toHaveAttribute('data-solid', 'false');
    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 300, configurable: true });
      window.dispatchEvent(new Event('scroll'));
    });
    expect(header()).toHaveAttribute('data-solid', 'true');
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    unmount();

    renderApp('/experiences');
    expect(header()).toHaveAttribute('data-solid', 'true');
  });

  it('opens an accessible drawer: focus inside, inert page, Escape closes and returns focus', async () => {
    const { container } = renderApp('/experiences');
    const menuButton = within(header()).getByRole('button', { name: 'Hap menynë' });
    menuButton.focus();
    fireEvent.click(menuButton);

    const drawer = screen.getByRole('dialog', { name: 'Menyja' });
    expect(within(drawer).getByRole('button', { name: 'Mbyll' })).toHaveFocus();
    expect(container.inert).toBe(true);
    const drawerNav = within(drawer).getByRole('navigation', { name: 'Navigimi kryesor' });
    expect(within(drawerNav).getByRole('link', { name: 'Përvojat' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Location, language and sign in are in the drawer too.
    expect(
      await within(drawer).findByRole('button', { name: 'Kinemaja: Prizren' }),
    ).toBeInTheDocument();
    expect(within(drawer).getByRole('group', { name: 'Gjuha' })).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: 'Hyr' })).toBeInTheDocument();

    fireEvent.keyDown(drawer, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container.inert).toBe(false);
    expect(menuButton).toHaveFocus();
  });

  it('closes the drawer when a section is chosen and navigates there', () => {
    const { router } = renderApp('/experiences');
    fireEvent.click(within(header()).getByRole('button', { name: 'Hap menynë' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Menyja' })).getByRole('link', { name: 'Ushqimi' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/food');
    expect(screen.getByRole('heading', { level: 1, name: 'Ushqimi' })).toBeInTheDocument();
  });

  it('opens the cinema picker on top of the drawer and returns to it', async () => {
    renderApp('/experiences');
    fireEvent.click(within(header()).getByRole('button', { name: 'Hap menynë' }));
    const drawer = screen.getByRole('dialog', { name: 'Menyja' });
    const locationButton = await within(drawer).findByRole('button', { name: 'Kinemaja: Prizren' });
    locationButton.focus();
    fireEvent.click(locationButton);

    const picker = screen.getByRole('dialog', { name: 'Zgjidh kinemanë' });
    fireEvent.click(within(picker).getByRole('button', { name: /Prishtinë/ }));
    expect(screen.queryByRole('dialog', { name: 'Zgjidh kinemanë' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Menyja' })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Kinemaja: Prishtinë' })).toHaveFocus();
  });

  it('switches the language of the whole shell', () => {
    renderApp('/experiences');
    fireEvent.click(within(header()).getByRole('button', { name: 'EN (English)' }));
    expect(document.documentElement.lang).toBe('en');
    const nav = within(header()).getByRole('navigation', { name: 'Main navigation' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Movies', 'Schedule', 'Experiences', 'Locations', 'Food']);
    expect(within(header()).getByRole('link', { name: 'Buy tickets' })).toBeInTheDocument();
    expect(
      screen.getByText('Portfolio project – Kinemax is a fictional cinema.'),
    ).toBeInTheDocument();
  });
});
