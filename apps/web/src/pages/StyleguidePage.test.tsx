import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/Toast/ToastProvider';
import { AuthProvider } from '../auth/AuthProvider';
import { I18nProvider } from '../i18n/I18nProvider';
import { LocationProvider } from '../location/LocationProvider';
import { stubCatalog } from '../test/catalog';
import { CONTRAST_PAIRS } from '../styles/contrast';
import { StyleguidePage } from './StyleguidePage';

function renderPage() {
  return render(
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <LocationProvider>
            <MemoryRouter initialEntries={['/styleguide']}>
              <StyleguidePage />
            </MemoryRouter>
          </LocationProvider>
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

beforeEach(() => {
  // jsdom has no canvas; the hero simply skips the dust without a context.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  stubCatalog();
  // No automatic cinema picker over the page in these tests.
  window.sessionStorage.setItem('kinemax.location-picker-dismissed', '1');
});

// The page is large: role queries over the whole document are slow in jsdom, especially with
// coverage on, so triggers are found by their text and the tests get a longer timeout.
const button = (text: string) => {
  const element = screen.getByText(text).closest('button');
  if (!element) throw new Error(`No button with text ${text}`);
  return element;
};

describe('StyleguidePage', { timeout: 30_000 }, () => {
  it('shows every section in Albanian by default', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Udhëzuesi i stilit' }),
    ).toBeInTheDocument();
    const toc = screen.getByRole('navigation', { name: 'Përmbajtja' });
    const links = within(toc).getAllByRole('link');
    expect(links).toHaveLength(17);
    // Every entry leads to its section, titled like the entry (demos add more h2 elements).
    for (const link of links) {
      const section = document.getElementById(link.getAttribute('href')?.slice(1) ?? '');
      expect(section?.querySelector('h2')?.textContent).toBe(link.textContent);
    }
    expect(screen.getByRole('heading', { level: 2, name: 'Pjesët e faqes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Faqja kryesore' })).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Kinemax' }).length).toBeGreaterThanOrEqual(4);
    // The seat map demo has every state; the bottom sheet opens.
    const seats = screen.getByRole('group', { name: 'Ulëset në Salla Demo' });
    expect(
      within(seats).getByRole('button', { name: /^Rreshti B, ulësja 2, Standard, e zgjedhur/ }),
    ).toBeInTheDocument();
    expect(
      within(seats).getByRole('button', { name: /^Rreshti B, ulësja 3, Standard, e zënë/ }),
    ).toBeInTheDocument();
    expect(
      within(seats).getByRole('button', { name: /^Rreshti A, ulësja 1, Hapësirë/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hap fletën' }));
    expect(screen.getByRole('dialog', { name: 'Filtrat' })).toBeInTheDocument();
  });

  it('switches all text to English', () => {
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'EN (English)' })[0] as HTMLElement);
    expect(screen.getByRole('heading', { level: 1, name: 'Style guide' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Colors' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('lists every contrast pair and all of them pass', () => {
    renderPage();
    // The first table on the page; the admin demo table comes later.
    const [table] = screen.getAllByRole('table');
    if (!table) throw new Error('no contrast table');
    expect(within(table).getAllByRole('row')).toHaveLength(CONTRAST_PAIRS.length + 1);
    expect(within(table).queryByText('Nuk kalon')).toBeNull();
    expect(within(table).getAllByText('Kalon')).toHaveLength(CONTRAST_PAIRS.length);
  });

  it('opens the dialog and confirms with a toast', () => {
    renderPage();
    fireEvent.click(button('Hap dialogun'));
    const dialog = screen.getByRole('dialog', { name: 'Konfirmo rezervimin' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anulo' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(button('Hap dialogun'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Konfirmo' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Rezervimi u ruajt')).toBeInTheDocument();

    fireEvent.click(button('Hap dialogun'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows toasts of every tone', () => {
    renderPage();
    for (const tone of ['Sukses', 'Gabim', 'Paralajmërim', 'Info']) {
      fireEvent.click(button(tone));
    }
    // The error summary demo is an alert too; the toast is in the notification region.
    const toasts = within(screen.getByRole('region', { name: 'Njoftimet' }));
    expect(toasts.getByRole('alert')).toHaveTextContent('Pagesa nuk u krye');
    expect(screen.getByText('U shtua një shfaqje e re')).toBeInTheDocument();
  });

  it('has working chips, radios and tabs', () => {
    renderPage();
    const comedy = button('Komedi');
    fireEvent.click(comedy);
    expect(comedy).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(comedy);
    expect(comedy).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Hiq Salla VIP' }));
    expect(screen.queryByRole('button', { name: 'Hiq Salla VIP' })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Standard' }));
    expect(screen.getByRole('radio', { name: 'Standard' })).toBeChecked();

    // The navigation demo (the home section has its own day tabs).
    const navigation = within(document.getElementById('navigation') as HTMLElement);
    fireEvent.click(navigation.getByRole('tab', { name: 'Nesër' }));
    expect(navigation.getByRole('tabpanel')).toHaveTextContent('Nesër: 16:00');
  });
});
