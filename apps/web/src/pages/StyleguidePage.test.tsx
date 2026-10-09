import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/Toast/ToastProvider';
import { I18nProvider } from '../i18n/I18nProvider';
import { CONTRAST_PAIRS } from '../styles/contrast';
import { StyleguidePage } from './StyleguidePage';

function renderPage() {
  return render(
    <I18nProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={['/styleguide']}>
          <StyleguidePage />
        </MemoryRouter>
      </ToastProvider>
    </I18nProvider>,
  );
}

beforeEach(() => {
  // jsdom has no canvas; the hero simply skips the dust without a context.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
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
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(13);
    const toc = screen.getByRole('navigation', { name: 'Përmbajtja' });
    expect(within(toc).getAllByRole('link')).toHaveLength(13);
    expect(screen.getAllByRole('img', { name: 'Kinemax' }).length).toBeGreaterThanOrEqual(4);
  });

  it('switches all text to English', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'EN (English)' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Style guide' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Colors' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('lists every contrast pair and all of them pass', () => {
    renderPage();
    const table = screen.getByRole('table');
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
    expect(screen.getByRole('alert')).toHaveTextContent('Pagesa nuk u krye');
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

    fireEvent.click(screen.getByRole('tab', { name: 'Nesër' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Nesër: 16:00');
  });
});
