import { expect, test } from '@playwright/test';

// API-level flow through the production build and the preview proxy (same origin as the web app).
test('register, read the session user, log out, and lose access', async ({ request, baseURL }) => {
  const origin = new URL(baseURL ?? '').origin;
  const email = `e2e-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}@kinemax.test`;

  const csrf = await request.get('/api/auth/csrf');
  expect(csrf.status()).toBe(200);
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };

  const registered = await request.post('/api/auth/register', {
    headers: { Origin: origin, 'X-CSRF-Token': csrfToken },
    data: { name: 'E2E Demo', email, password: 'an-e2e-only-passphrase', preferredLocale: 'sq' },
  });
  expect(registered.status()).toBe(201);
  const session = (await registered.json()) as {
    user: { email: string; role: string };
    csrfToken: string;
  };
  expect(session.user).toMatchObject({ email, role: 'CUSTOMER' });
  expect(JSON.stringify(session)).not.toContain('passwordHash');
  const cookie = registered.headers()['set-cookie'] ?? '';
  expect(cookie).toContain('kinemax_session=');
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/SameSite=Lax/i);

  const me = await request.get('/api/auth/me');
  expect(me.status()).toBe(200);
  expect(((await me.json()) as { user: { email: string } }).user.email).toBe(email);

  const logout = await request.post('/api/auth/logout', {
    headers: { Origin: origin, 'X-CSRF-Token': session.csrfToken },
  });
  expect(logout.status()).toBe(204);

  const after = await request.get('/api/auth/me');
  expect(after.status()).toBe(401);
});

test('state-changing requests without a CSRF token are blocked', async ({ request, baseURL }) => {
  const origin = new URL(baseURL ?? '').origin;
  const res = await request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { email: 'nobody@kinemax.test', password: 'whatever-123' },
  });
  expect(res.status()).toBe(403);
});
