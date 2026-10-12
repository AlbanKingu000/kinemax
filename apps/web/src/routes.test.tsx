import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from './components/Toast/ToastProvider';
import { I18nProvider } from './i18n/I18nProvider';
import { LocationProvider } from './location/LocationProvider';
import { LOCATION_STORAGE_KEY } from './location/location-storage';
import { routes } from './routes';
import { renderApp, stubCatalog } from './test/catalog';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
  stubCatalog();
});

const description = () =>
  document.querySelector('meta[name="description"]')?.getAttribute('content');

describe('routes', () => {
  it.each([
    ['/movies', 'Filmat'],
    ['/experiences', 'Përvojat'],
    ['/locations', 'Lokacionet'],
    ['/food', 'Ushqimi'],
    ['/login', 'Hyr'],
  ])('%s is a translated "coming soon" page with its own title', (path, title) => {
    renderApp(path);
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(within(main).getByText('Së shpejti')).toBeInTheDocument();
    expect(within(main).getByRole('link', { name: 'Kthehu në faqen kryesore' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(document.title).toBe(`${title} · Kinemax`);
    expect(description()).toBeTruthy();
  });

  it('shows the coming soon pages in English too', () => {
    renderApp('/experiences', { locale: 'en' });
    expect(screen.getByRole('heading', { level: 1, name: 'Experiences' })).toBeInTheDocument();
    expect(document.title).toBe('Experiences · Kinemax');
    expect(description()).toMatch(/VIP Recliner/);
  });

  it('renders a translated 404 page inside the site shell', () => {
    renderApp('/no-such-page');
    expect(screen.getByRole('heading', { level: 1, name: 'Faqja nuk u gjet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kthehu në faqen kryesore' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(document.title).toBe('Faqja nuk u gjet · Kinemax');
  });

  it('has a skip link to the main content', () => {
    renderApp('/food');
    expect(screen.getByRole('link', { name: 'Kalo te përmbajtja' })).toHaveAttribute(
      'href',
      '#main',
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('shows the cinemas with their addresses and the portfolio note in the footer', async () => {
    renderApp('/food');
    const footer = screen.getByRole('contentinfo');
    expect(await within(footer).findByText('Kinemax Prizren')).toBeInTheDocument();
    expect(within(footer).getByText('Rruga e Prizren 1')).toBeInTheDocument();
    expect(
      within(footer).getByText('Projekt portfolio – Kinemax është kinema fiktive.'),
    ).toBeInTheDocument();
    expect(
      within(footer).getByText(`© ${String(new Date().getFullYear())} Kinemax`),
    ).toBeInTheDocument();
    expect(within(footer).getByRole('group', { name: 'Gjuha' })).toBeInTheDocument();
  });

  it(
    'serves the styleguide in development builds (production: see e2e)',
    { timeout: 30_000 },
    async () => {
      expect(import.meta.env.DEV).toBe(true);
      const router = createMemoryRouter(routes, { initialEntries: ['/styleguide'] });
      render(
        <I18nProvider>
          <ToastProvider>
            <LocationProvider>
              <RouterProvider router={router} />
            </LocationProvider>
          </ToastProvider>
        </I18nProvider>,
      );
      expect(
        await screen.findByRole(
          'heading',
          { level: 1, name: 'Udhëzuesi i stilit' },
          { timeout: 15_000 },
        ),
      ).toBeInTheDocument();
    },
  );
});
