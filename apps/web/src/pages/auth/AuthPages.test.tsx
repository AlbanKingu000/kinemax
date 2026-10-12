import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setCsrfToken } from '../../api/http';
import { LOCALE_SAVE_DELAY_MS } from '../../auth/AuthProvider';
import { LOCALE_STORAGE_KEY } from '../../i18n/locale-storage';
import { LOCATION_STORAGE_KEY } from '../../location/location-storage';
import { renderApp } from '../../test/catalog';
import { stubAuth, testUser } from '../../test/auth';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
  setCsrfToken(null);
});

const field = (name: string) => screen.getByLabelText(name, { exact: false });

describe('LoginPage', () => {
  it('has labelled fields with autocomplete, a password toggle and a safe ?next=', async () => {
    const auth = stubAuth();
    const { router } = renderApp('/login?next=%2Fschedule%3Fformat%3D3D');
    const email = await screen.findByLabelText(/Email-i/);
    expect(email).toHaveAttribute('autocomplete', 'email');
    const password = screen.getByLabelText(/^Fjalëkalimi/);
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Shfaq fjalëkalimin' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Fshih fjalëkalimin' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.change(email, { target: { value: 'ana@kinemax.test' } });
    fireEvent.change(password, { target: { value: 'any-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hyr' }));
    await waitFor(() => {
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/schedule?format=3D',
      );
    });
    expect(auth.requests.map((r) => `${r.method} ${r.path}`)).toContain('POST /api/auth/login');
    // The account language (en in the fake) takes over the UI.
    expect(document.documentElement.lang).toBe('en');
  });

  it('ignores a ?next= to another site', async () => {
    stubAuth();
    for (const next of ['https%3A%2F%2Fevil.example', '%2F%2Fevil.example', '%2F%5Cevil.example']) {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, 'sq');
      const { router, unmount } = renderApp(`/login?next=${next}`);
      fireEvent.change(await screen.findByLabelText(/Email-i/), {
        target: { value: 'ana@kinemax.test' },
      });
      fireEvent.change(screen.getByLabelText(/^Fjalëkalimi/), { target: { value: 'x' } });
      fireEvent.click(screen.getByRole('button', { name: 'Hyr' }));
      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/');
      });
      unmount();
      stubAuth();
    }
  });

  it('validates on the client, focuses an error summary and links it to the fields', async () => {
    const auth = stubAuth();
    renderApp('/login');
    fireEvent.change(await screen.findByLabelText(/Email-i/), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hyr' }));
    const summary = screen.getByRole('alert');
    expect(summary).toHaveFocus();
    expect(
      within(summary).getByRole('link', { name: 'Shkruaj një adresë email-i të vlefshme.' }),
    ).toHaveAttribute('href', '#login-email');
    expect(field('Email-i')).toHaveAttribute('aria-invalid', 'true');
    expect(field('Email-i').getAttribute('aria-describedby')).toMatch(/login-email-error/);
    expect(auth.requests.filter((r) => r.path === '/api/auth/login')).toEqual([]);
  });

  it('shows a generic error for wrong credentials and the wait time when rate limited', async () => {
    const auth = stubAuth();
    renderApp('/login');
    fireEvent.change(await screen.findByLabelText(/Email-i/), {
      target: { value: 'ana@kinemax.test' },
    });
    fireEvent.change(screen.getByLabelText(/^Fjalëkalimi/), { target: { value: 'wrong-one-123' } });
    auth.fail = { path: '/api/auth/login', status: 401, code: 'invalid_credentials' };
    fireEvent.click(screen.getByRole('button', { name: 'Hyr' }));
    expect(await screen.findByText('Email-i ose fjalëkalimi është i pasaktë.')).toBeInTheDocument();
    auth.fail = {
      path: '/api/auth/login',
      status: 429,
      code: 'rate_limited',
      headers: { 'Retry-After': '540' },
    };
    fireEvent.click(screen.getByRole('button', { name: 'Hyr' }));
    expect(
      await screen.findByText('Shumë përpjekje, provo përsëri pas 9 minutash.'),
    ).toBeInTheDocument();
  });

  it('does not submit twice while a request is running', async () => {
    const auth = stubAuth();
    renderApp('/login');
    fireEvent.change(await screen.findByLabelText(/Email-i/), {
      target: { value: 'ana@kinemax.test' },
    });
    fireEvent.change(screen.getByLabelText(/^Fjalëkalimi/), { target: { value: 'x' } });
    const button = screen.getByRole('button', { name: 'Hyr' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => {
      expect(auth.user).not.toBeNull();
    });
    expect(auth.requests.filter((r) => r.path === '/api/auth/login')).toHaveLength(1);
  });
});

describe('RegisterPage', () => {
  it('mirrors the password rules, then signs up in the current language', async () => {
    const auth = stubAuth();
    const { router } = renderApp('/register');
    fireEvent.change(await screen.findByLabelText(/^Emri/), { target: { value: 'Ana Krasniqi' } });
    fireEvent.change(screen.getByLabelText(/Email-i/), { target: { value: 'ana@kinemax.test' } });
    const password = screen.getByLabelText(/^Fjalëkalimi/);
    expect(password).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByText(/Të paktën 10 karaktere/)).toBeInTheDocument();
    for (const [value, message] of [
      ['short', 'Fjalëkalimi duhet të ketë të paktën 10 karaktere.'],
      ['ANA@kinemax.test', 'Fjalëkalimi nuk mund të jetë email-i yt.'],
      ['x'.repeat(129), 'Fjalëkalimi mund të ketë deri në 128 karaktere.'],
    ] as const) {
      fireEvent.change(password, { target: { value } });
      fireEvent.click(screen.getByRole('button', { name: 'Krijo llogarinë' }));
      expect(within(screen.getByRole('alert')).getByText(message)).toBeInTheDocument();
    }
    // The server's policy answers with field codes, shown at the field.
    auth.fail = { path: '/api/auth/register', status: 400, code: 'validation_failed' };
    fireEvent.change(password, { target: { value: 'a long enough passphrase' } });
    fireEvent.click(screen.getByRole('button', { name: 'Krijo llogarinë' }));
    expect(await screen.findByText('Diçka nuk shkoi. Provo përsëri.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Krijo llogarinë' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(auth.requests.find((r) => r.path === '/api/auth/register')?.body).toMatchObject({
      name: 'Ana Krasniqi',
      preferredLocale: 'sq',
    });
    expect(screen.getByRole('button', { name: 'Llogaria e Ana Krasniqi' })).toHaveTextContent(
      'Ana',
    );
  });
});

describe('AccountPage and the header', () => {
  it('sends anonymous visitors to the login page and back', async () => {
    stubAuth();
    const { router } = renderApp('/account');
    await waitFor(() => {
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/login?next=%2Faccount',
      );
    });
  });

  it('edits the profile, changes the password and signs out everywhere', async () => {
    const auth = stubAuth(testUser());
    const { router } = renderApp('/account');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Llogaria ime' }),
    ).toBeInTheDocument();
    expect(field('Email-i')).toHaveAttribute('readonly');

    fireEvent.change(screen.getByLabelText(/^Emri/), { target: { value: 'Ana K.' } });
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ruaj ndryshimet' }));
    expect(await screen.findByText('Your changes were saved.')).toBeInTheDocument();
    expect(auth.user).toMatchObject({ name: 'Ana K.', preferredLocale: 'en' });
    expect(document.documentElement.lang).toBe('en');

    fireEvent.change(screen.getByLabelText(/^Current password/), {
      target: { value: 'old-password-1' },
    });
    fireEvent.change(screen.getByLabelText(/^New password/), {
      target: { value: 'old-password-1' },
    });
    auth.fail = { path: '/api/auth/change-password', status: 400, code: 'invalid_credentials' };
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('The current password is incorrect.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/Your password was changed/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out on all devices' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(auth.user).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Sign in' }).length).toBeGreaterThan(0);
  });

  it('shows the account menu with the first name and signs out', async () => {
    const auth = stubAuth(testUser());
    renderApp('/food');
    const menuButton = await screen.findByRole('button', { name: 'Llogaria e Ana Krasniqi' });
    fireEvent.click(menuButton);
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Llogaria ime' })).toHaveAttribute('href', '/account');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    expect(menuButton).toHaveFocus();
    fireEvent.click(menuButton);
    fireEvent.click(screen.getByRole('button', { name: 'Dil' }));
    expect(await screen.findByText('Dole nga llogaria.')).toBeInTheDocument();
    expect(auth.user).toBeNull();
  });

  it('saves SQ/EN changes of a signed-in user once, after a short pause', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const auth = stubAuth(testUser());
    renderApp('/food');
    await screen.findByRole('button', { name: 'Llogaria e Ana Krasniqi' });
    const header = screen.getByRole('banner');
    fireEvent.click(within(header).getByRole('button', { name: 'EN (English)' }));
    fireEvent.click(within(header).getByRole('button', { name: 'SQ (Shqip)' }));
    fireEvent.click(within(header).getByRole('button', { name: 'EN (English)' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOCALE_SAVE_DELAY_MS + 50);
    });
    const patches = auth.requests.filter((r) => r.method === 'PATCH');
    expect(patches).toEqual([
      { method: 'PATCH', path: '/api/auth/me', body: { preferredLocale: 'en' } },
    ]);
    vi.useRealTimers();
  });
});
