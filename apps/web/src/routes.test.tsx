import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from './i18n/I18nProvider';
import { routes } from './routes';
import { stubFetchJson } from './test/fetch';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
}

describe('routes', () => {
  it('renders the home page at /', () => {
    stubFetchJson({ status: 'ok', db: 'up' });
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Kinemax' })).toBeInTheDocument();
  });

  it('renders a translated not-found page with a link home', () => {
    renderAt('/no-such-page');
    expect(screen.getByRole('heading', { level: 1, name: 'Faqja nuk u gjet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kthehu në faqen kryesore' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
