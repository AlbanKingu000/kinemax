import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider';
import { stubFetchFailure, stubFetchJson } from '../test/fetch';
import { HomePage } from './HomePage';

function renderHome(locale?: 'sq' | 'en') {
  return render(
    <I18nProvider {...(locale ? { locale } : {})}>
      <HomePage />
    </I18nProvider>,
  );
}

describe('HomePage', () => {
  it('shows the brand and a checking message while loading', () => {
    stubFetchJson({ status: 'ok', db: 'up' });
    renderHome();
    expect(screen.getByRole('heading', { level: 1, name: 'Kinemax' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Duke kontrolluar…');
  });

  it('shows a healthy API and database in Albanian by default', async () => {
    stubFetchJson({ status: 'ok', db: 'up' });
    renderHome();
    const status = screen.getByRole('status');
    expect(await within(status).findByText('Në rregull')).toBeInTheDocument();
    expect(within(status).getByText('Në funksion')).toBeInTheDocument();
    expect(within(status).getByText('Baza e të dhënave')).toBeInTheDocument();
  });

  it('shows a database outage', async () => {
    stubFetchJson({ status: 'error', db: 'down' }, 503);
    renderHome();
    const status = screen.getByRole('status');
    expect(await within(status).findByText('Me probleme')).toBeInTheDocument();
    expect(within(status).getByText('Jashtë funksionit')).toBeInTheDocument();
  });

  it('shows when the API cannot be reached', async () => {
    stubFetchFailure();
    renderHome();
    expect(await screen.findByText('Nuk u arrit lidhja me API-në.')).toBeInTheDocument();
  });

  it('renders English text when the locale is en', async () => {
    stubFetchJson({ status: 'ok', db: 'up' });
    renderHome('en');
    expect(screen.getByRole('heading', { level: 2, name: 'System status' })).toBeInTheDocument();
    expect(await screen.findByText('OK')).toBeInTheDocument();
    expect(screen.getByText('Up')).toBeInTheDocument();
  });

  it('ignores the result after unmounting', () => {
    const fetchMock = stubFetchFailure();
    const { unmount } = renderHome();
    unmount();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
