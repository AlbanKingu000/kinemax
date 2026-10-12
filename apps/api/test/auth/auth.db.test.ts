// Integration tests for /api/auth and the authorization middleware (kinemax_test only).
import {
  apiErrorResponseSchema,
  authSessionResponseSchema,
  CSRF_HEADER,
  meResponseSchema,
} from '@kinemax/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../../src/auth/password.js';
import { hashToken } from '../../src/auth/tokens.js';
import { resetDatabase } from '../db/helpers.js';
import {
  APP_ORIGIN,
  browserClient,
  cookieValue,
  makeTestApp,
  setCookie,
  testPrisma,
} from '../support/app.js';

const prisma = testPrisma();
const PASSWORD = 'Kinemax-test-Passw0rd';
const SESSION_COOKIE = 'kinemax_session';

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createUser(
  overrides: Partial<{
    email: string;
    role: 'CUSTOMER' | 'LOCATION_MANAGER' | 'SUPER_ADMIN';
    isActive: boolean;
    password: string;
  }> = {},
) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? 'ana@kinemax.test',
      name: 'Ana',
      role: overrides.role ?? 'CUSTOMER',
      isActive: overrides.isActive ?? true,
      passwordHash: await hashPassword(overrides.password ?? PASSWORD),
    },
  });
}

async function createLocation(slug: string) {
  return prisma.location.create({
    data: { slug, name: slug, city: slug, address: 'x', timeZone: 'Europe/Belgrade' },
  });
}

type Client = Awaited<ReturnType<typeof browserClient>>;

async function login(client: Client, email = 'ana@kinemax.test', password = PASSWORD) {
  const res = await client.post('/api/auth/login', { email, password });
  if (res.status === 200) client.token = authSessionResponseSchema.parse(res.body).csrfToken;
  return res;
}

const registration = {
  name: 'Blerta Demo',
  email: 'Blerta@Kinemax.test',
  password: 'a-long-unique-passphrase',
  preferredLocale: 'en',
};

describe('GET /api/auth/csrf', () => {
  it('returns a token and sets an httpOnly anonymous cookie it is bound to', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/api/auth/csrf').expect(200);
    expect(res.body).toEqual({ csrfToken: expect.any(String) as unknown });
    expect(res.headers['cache-control']).toBe('no-store');
    const cookie = setCookie(res, 'kinemax_csrf');
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
  });
});

describe('POST /api/auth/register', () => {
  it('creates a CUSTOMER, signs them in and sets a secure-by-default session cookie', async () => {
    const { app } = makeTestApp();
    const client = await browserClient(app);
    const res = await client.post('/api/auth/register', registration).expect(201);
    const body = authSessionResponseSchema.parse(res.body);
    expect(body.user).toMatchObject({
      email: 'blerta@kinemax.test',
      name: 'Blerta Demo',
      role: 'CUSTOMER',
      preferredLocale: 'en',
      managedLocationIds: [],
    });
    expect(res.text).not.toContain('passwordHash');
    expect(res.text).not.toContain('$argon2');

    const cookie = setCookie(res, SESSION_COOKIE);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(cookie).not.toMatch(/Secure/);
    expect(cookie).not.toMatch(/Domain=/i);

    // Only the SHA-256 hash of the token is stored.
    const token = cookieValue(cookie) ?? '';
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const session = await prisma.session.findFirstOrThrow({ where: { userId: body.user.id } });
    expect(session.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(session)).not.toContain(token);

    const me = await client.get('/api/auth/me').expect(200);
    expect(meResponseSchema.parse(me.body).user.id).toBe(body.user.id);
  });

  it('uses Secure __Host- cookies when configured for production', async () => {
    const { app } = makeTestApp({ cookieSecure: true });
    // Like a browser, Supertest's cookie jar does not send Secure cookies over plain http, so the
    // anonymous CSRF cookie is passed explicitly here.
    const csrf = await request(app).get('/api/auth/csrf').expect(200);
    const anonymous = setCookie(csrf, '__Host-kinemax_csrf');
    expect(anonymous).toMatch(/Secure/);
    const res = await request(app)
      .post('/api/auth/register')
      .set('Origin', APP_ORIGIN)
      .set('Cookie', `__Host-kinemax_csrf=${cookieValue(anonymous) ?? ''}`)
      .set(CSRF_HEADER, (csrf.body as { csrfToken: string }).csrfToken)
      .send(registration)
      .expect(201);
    const cookie = setCookie(res, '__Host-kinemax_session');
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('never lets the client choose a role or other fields', async () => {
    const { app } = makeTestApp();
    const client = await browserClient(app);
    const res = await client
      .post('/api/auth/register', { ...registration, role: 'SUPER_ADMIN' })
      .expect(400);
    expect(apiErrorResponseSchema.parse(res.body).error).toMatchObject({
      code: 'validation_failed',
      fields: [{ path: '(root)', code: 'unrecognized_keys' }],
    });
    expect(await prisma.user.count()).toBe(0);
  });

  it('enforces the password policy without echoing the password', async () => {
    const { app } = makeTestApp();
    const client = await browserClient(app);
    const fieldsFor = async (password: string, email = registration.email) => {
      const res = await client.post('/api/auth/register', { ...registration, email, password });
      expect(res.status).toBe(400);
      expect(res.text).not.toContain(password);
      return apiErrorResponseSchema.parse(res.body).error.fields;
    };
    expect(await fieldsFor('short1')).toEqual([{ path: 'password', code: 'too_small' }]);
    expect(await fieldsFor('x'.repeat(129))).toEqual([{ path: 'password', code: 'too_big' }]);
    expect(await fieldsFor('Password123')).toEqual([{ path: 'password', code: 'too_common' }]);
    expect(await fieldsFor('blerta@kinemax.test')).toEqual([
      { path: 'password', code: 'same_as_email' },
    ]);
    expect(await prisma.user.count()).toBe(0);
  });

  it('rejects an existing email generically (case-insensitive)', async () => {
    await createUser({ email: 'blerta@kinemax.test' });
    const { app, logger } = makeTestApp();
    const client = await browserClient(app);
    const res = await client.post('/api/auth/register', registration).expect(409);
    expect(res.body).toEqual({
      error: { code: 'conflict', message: 'This account could not be created.' },
    });
    expect(setCookie(res, SESSION_COOKIE)).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'auth.register.rejected',
      expect.objectContaining({ email: 'b***@kinemax.test' }),
    );
  });
});

describe('POST /api/auth/login', () => {
  it('signs in, returns the user and a CSRF token for the new session', async () => {
    const user = await createUser();
    const { app, logger } = makeTestApp();
    const client = await browserClient(app);
    const res = await login(client);
    expect(res.status).toBe(200);
    expect(authSessionResponseSchema.parse(res.body).user.id).toBe(user.id);
    expect(res.text).not.toContain('$argon2');
    expect(logger.info).toHaveBeenCalledWith(
      'auth.login.success',
      expect.objectContaining({ userId: user.id, email: 'a***@kinemax.test' }),
    );
    // The new token works for state-changing requests of the new session.
    await client.patch('/api/auth/me', { name: 'Ana B' }).expect(200);
  });

  it('rotates the session: a previous session token stops working', async () => {
    await createUser();
    const { app } = makeTestApp();
    const client = await browserClient(app);
    const first = await login(client);
    const firstToken = cookieValue(setCookie(first, SESSION_COOKIE));
    const second = await login(client);
    const secondToken = cookieValue(setCookie(second, SESSION_COOKIE));
    expect(secondToken).not.toBe(firstToken);
    await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${firstToken ?? ''}`)
      .expect(401);
    await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${secondToken ?? ''}`)
      .expect(200);
    expect(await prisma.session.count()).toBe(1);
  });

  it('gives the same generic error for an unknown email and a wrong password', async () => {
    await createUser();
    const { app, logger } = makeTestApp();
    const client = await browserClient(app);
    const unknown = await login(client, 'nobody@kinemax.test');
    const wrong = await login(client, 'ana@kinemax.test', 'not-the-password');
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(unknown.body).toEqual({
      error: { code: 'invalid_credentials', message: 'Email or password is incorrect.' },
    });
    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).toContain('unknown_email');
    expect(logged).toContain('wrong_password');
    expect(logged).not.toContain('not-the-password');
    expect(logged).not.toContain('nobody@kinemax.test');
  });

  it('rejects inactive users and ends their existing sessions', async () => {
    const user = await createUser();
    const { app } = makeTestApp();
    const client = await browserClient(app);
    await login(client);
    await client.get('/api/auth/me').expect(200);

    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    await client.get('/api/auth/me').expect(401);
    expect(await prisma.session.count()).toBe(0);

    const other = await browserClient(app);
    const res = await login(other);
    expect(res.status).toBe(401);
    expect(apiErrorResponseSchema.parse(res.body).error.code).toBe('invalid_credentials');
  });
});

describe('logout', () => {
  it('POST /logout destroys the session and clears the cookie', async () => {
    await createUser();
    const { app } = makeTestApp();
    const client = await browserClient(app);
    const res = await login(client);
    const token = cookieValue(setCookie(res, SESSION_COOKIE)) ?? '';
    const out = await client.post('/api/auth/logout').expect(204);
    expect(setCookie(out, SESSION_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(await prisma.session.count()).toBe(0);
    await client.get('/api/auth/me').expect(401);
    await request(app).get('/api/auth/me').set('Cookie', `${SESSION_COOKIE}=${token}`).expect(401);
  });

  it('POST /logout-all ends every session of the user', async () => {
    await createUser();
    const { app } = makeTestApp();
    const laptop = await browserClient(app);
    const phone = await browserClient(app);
    await login(laptop);
    await login(phone);
    expect(await prisma.session.count()).toBe(2);
    await laptop.post('/api/auth/logout-all').expect(204);
    await laptop.get('/api/auth/me').expect(401);
    await phone.get('/api/auth/me').expect(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it('POST /logout-all requires a session', async () => {
    const { app } = makeTestApp();
    const client = await browserClient(app);
    await client.post('/api/auth/logout-all').expect(401);
  });
});

describe('/api/auth/me', () => {
  it('requires a session', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/api/auth/me').expect(401);
    expect(res.body).toEqual({ error: { code: 'unauthorized', message: 'Please sign in.' } });
  });

  it('lists managed locations for managers only', async () => {
    const manager = await createUser({ email: 'm@kinemax.test', role: 'LOCATION_MANAGER' });
    const [a, b] = [await createLocation('a'), await createLocation('b')];
    await prisma.managerLocation.createMany({
      data: [a, b].map((l) => ({ userId: manager.id, locationId: l.id })),
    });
    const { app } = makeTestApp();
    const client = await browserClient(app);
    await login(client, 'm@kinemax.test');
    const res = await client.get('/api/auth/me').expect(200);
    expect(meResponseSchema.parse(res.body).user.managedLocationIds.sort()).toEqual(
      [a.id, b.id].sort(),
    );
  });

  it('PATCH changes only name and preferred locale', async () => {
    await createUser();
    const { app } = makeTestApp();
    const client = await browserClient(app);
    await login(client);
    const res = await client
      .patch('/api/auth/me', { name: '  Ana Kelmendi ', preferredLocale: 'en' })
      .expect(200);
    expect(meResponseSchema.parse(res.body).user).toMatchObject({
      name: 'Ana Kelmendi',
      preferredLocale: 'en',
      role: 'CUSTOMER',
    });
    for (const body of [
      { role: 'SUPER_ADMIN' },
      { email: 'x@kinemax.test' },
      {},
      { isActive: false },
    ]) {
      await client.patch('/api/auth/me', body).expect(400);
    }
    const user = await prisma.user.findFirstOrThrow();
    expect(user).toMatchObject({ role: 'CUSTOMER', email: 'ana@kinemax.test', isActive: true });
  });
});

describe('POST /api/auth/change-password', () => {
  it('changes the password, rotates this session and revokes all others', async () => {
    await createUser();
    const { app } = makeTestApp();
    const current = await browserClient(app);
    const other = await browserClient(app);
    const loginRes = await login(current);
    await login(other);
    const oldToken = cookieValue(setCookie(loginRes, SESSION_COOKIE)) ?? '';

    const res = await current
      .post('/api/auth/change-password', {
        currentPassword: PASSWORD,
        newPassword: 'another-long-passphrase',
      })
      .expect(200);
    current.token = authSessionResponseSchema.parse(res.body).csrfToken;
    expect(res.text).not.toContain('$argon2');

    await current.get('/api/auth/me').expect(200);
    await other.get('/api/auth/me').expect(401);
    await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${oldToken}`)
      .expect(401);
    expect(await prisma.session.count()).toBe(1);

    const fresh = await browserClient(app);
    expect((await login(fresh)).status).toBe(401);
    expect((await login(fresh, 'ana@kinemax.test', 'another-long-passphrase')).status).toBe(200);
  });

  it('rejects a wrong current password, the same password and policy violations', async () => {
    await createUser();
    const { app } = makeTestApp();
    const client = await browserClient(app);
    await login(client);
    const change = (currentPassword: string, newPassword: string) =>
      client.post('/api/auth/change-password', { currentPassword, newPassword });

    const wrong = await change('wrong-password', 'another-long-passphrase');
    expect(wrong.status).toBe(400);
    expect(apiErrorResponseSchema.parse(wrong.body).error.code).toBe('invalid_credentials');
    const same = await change(PASSWORD, PASSWORD);
    expect(apiErrorResponseSchema.parse(same.body).error.fields).toEqual([
      { path: 'password', code: 'same_as_current' },
    ]);
    const common = await change(PASSWORD, 'qwertyuiop');
    expect(apiErrorResponseSchema.parse(common.body).error.fields).toEqual([
      { path: 'password', code: 'too_common' },
    ]);
    await client.get('/api/auth/me').expect(200);
  });

  it('requires a session', async () => {
    const { app } = makeTestApp();
    const client = await browserClient(app);
    await client
      .post('/api/auth/change-password', { currentPassword: 'x', newPassword: 'y'.repeat(12) })
      .expect(401);
  });
});

describe('CSRF and origin checks', () => {
  async function signedInClient() {
    await createUser();
    const made = makeTestApp();
    const client = await browserClient(made.app);
    await login(client);
    return { ...made, client };
  }

  it('rejects state-changing requests without a token, with a wrong token or a foreign token', async () => {
    const { app, client, logger } = await signedInClient();
    const patch = () =>
      client.agent.patch('/api/auth/me').set('Origin', APP_ORIGIN).send({ name: 'X' });

    const missing = await patch().expect(403);
    expect(missing.body).toEqual({
      error: { code: 'csrf_invalid', message: 'The request was blocked.' },
    });
    await patch().set(CSRF_HEADER, 'abc.def').expect(403);
    await patch().set(CSRF_HEADER, `${client.token}x`).expect(403);

    // A valid token of another (anonymous) session does not work here.
    const stranger = await browserClient(app);
    await patch().set(CSRF_HEADER, stranger.token).expect(403);
    expect(logger.warn).toHaveBeenCalledWith(
      'security.csrf.blocked',
      expect.objectContaining({ reason: 'token' }),
    );
    await patch().set(CSRF_HEADER, client.token).expect(200);
  });

  it('rejects a wrong, missing or opaque Origin, and accepts a same-origin Referer', async () => {
    const { client, logger } = await signedInClient();
    const patch = () =>
      client.agent.patch('/api/auth/me').set(CSRF_HEADER, client.token).send({ name: 'X' });

    const foreign = await patch().set('Origin', 'https://evil.example').expect(403);
    // Origin failures are plain forbidden: a client must not retry them.
    expect((foreign.body as { error: { code: string } }).error.code).toBe('forbidden');
    await patch().set('Origin', 'null').expect(403);
    await patch().expect(403);
    await patch().set('Referer', 'https://evil.example/page').expect(403);
    expect(logger.warn).toHaveBeenCalledWith(
      'security.csrf.blocked',
      expect.objectContaining({ reason: 'origin' }),
    );
    await patch().set('Referer', `${APP_ORIGIN}/konto`).expect(200);
  });

  it('protects login and register too, and invalidates pre-login tokens after login', async () => {
    await createUser();
    const { app } = makeTestApp();
    const client = await browserClient(app);
    const anonymousToken = client.token;
    await client.agent
      .post('/api/auth/login')
      .set('Origin', APP_ORIGIN)
      .send({ email: 'ana@kinemax.test', password: PASSWORD })
      .expect(403);
    await login(client);
    await client.agent
      .patch('/api/auth/me')
      .set('Origin', APP_ORIGIN)
      .set(CSRF_HEADER, anonymousToken)
      .send({ name: 'X' })
      .expect(403);
  });

  it('lets safe methods through without a token', async () => {
    const { app } = makeTestApp();
    await request(app).get('/api/health').set('Origin', 'https://evil.example').expect(200);
  });
});

describe('session lifetime', () => {
  async function signedIn() {
    const user = await createUser();
    const { app } = makeTestApp();
    const client = await browserClient(app);
    await login(client);
    return { app, client, user };
  }
  const DAY = 24 * 3_600_000;

  it('rejects and deletes a session idle for more than 7 days', async () => {
    const { client } = await signedIn();
    await prisma.session.updateMany({
      data: { lastSeenAt: new Date(Date.now() - 7 * DAY - 1000) },
    });
    await client.get('/api/auth/me').expect(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it('rejects a session past its 30-day absolute lifetime even when active', async () => {
    const { client } = await signedIn();
    await prisma.session.updateMany({
      data: { createdAt: new Date(Date.now() - 31 * DAY), expiresAt: new Date(Date.now() - DAY) },
    });
    await client.get('/api/auth/me').expect(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it('slides the idle timeout, writing lastSeenAt at most every 5 minutes', async () => {
    const { client } = await signedIn();
    const twoMinutesAgo = new Date(Date.now() - 2 * 60_000);
    await prisma.session.updateMany({ data: { lastSeenAt: twoMinutesAgo } });
    await client.get('/api/auth/me').expect(200);
    expect((await prisma.session.findFirstOrThrow()).lastSeenAt).toEqual(twoMinutesAgo);

    await prisma.session.updateMany({ data: { lastSeenAt: new Date(Date.now() - 6 * 60_000) } });
    await client.get('/api/auth/me').expect(200);
    const seen = (await prisma.session.findFirstOrThrow()).lastSeenAt.getTime();
    expect(Date.now() - seen).toBeLessThan(10_000);
  });

  it('ignores malformed and unknown session cookies', async () => {
    const { app } = makeTestApp();
    await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=not-a-token`)
      .expect(401);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${'A'.repeat(43)}`)
      .expect(401);
    expect(setCookie(res, SESSION_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe('rate limiting', () => {
  it('limits login attempts per email and IP to 5 per 15 minutes', async () => {
    await createUser();
    const { app, logger } = makeTestApp();
    const client = await browserClient(app);
    for (let i = 0; i < 5; i++)
      expect((await login(client, 'ana@kinemax.test', 'wrong-1')).status).toBe(401);
    const blocked = await login(client);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(800);
    expect(apiErrorResponseSchema.parse(blocked.body).error.code).toBe('rate_limited');
    expect(logger.warn).toHaveBeenCalledWith(
      'security.rate_limited',
      expect.objectContaining({ event: 'login_email', email: 'a***@kinemax.test' }),
    );
    // Another account from the same IP is not blocked by this limit.
    expect((await login(client, 'other@kinemax.test', 'wrong-1')).status).toBe(401);
  });

  it('resets the per-account counter after a successful login', async () => {
    await createUser();
    const { app } = makeTestApp();
    const client = await browserClient(app);
    for (let i = 0; i < 4; i++) await login(client, 'ana@kinemax.test', 'wrong-1');
    expect((await login(client)).status).toBe(200);
    for (let i = 0; i < 5; i++)
      expect((await login(client, 'ana@kinemax.test', 'wrong-1')).status).toBe(401);
  });

  it('has an IP-wide login limit, a register limit per IP and a change-password limit per user', async () => {
    await createUser();
    const tight = { windowMs: 60_000, max: 2 };
    const { app } = makeTestApp({
      rateLimits: {
        loginPerIp: tight,
        loginPerEmailAndIp: { windowMs: 60_000, max: 100 },
        registerPerIp: tight,
        changePasswordPerUser: tight,
      },
    });
    const client = await browserClient(app);
    expect((await login(client, 'a@kinemax.test', 'x')).status).toBe(401);
    expect((await login(client, 'b@kinemax.test', 'x')).status).toBe(401);
    expect((await login(client, 'c@kinemax.test', 'x')).status).toBe(429);

    const reg = (n: number) =>
      client.post('/api/auth/register', { ...registration, email: `r${String(n)}@kinemax.test` });
    // Each registration signs in (new session), so the client switches to the new CSRF token.
    for (const n of [1, 2]) {
      const res = await reg(n);
      expect(res.status).toBe(201);
      client.token = authSessionResponseSchema.parse(res.body).csrfToken;
    }
    expect((await reg(3)).status).toBe(429);

    const change = () =>
      client.post('/api/auth/change-password', {
        currentPassword: 'wrong',
        newPassword: 'z'.repeat(12),
      });
    expect((await change()).status).toBe(400);
    expect((await change()).status).toBe(400);
    const blocked = await change();
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });
});

describe('authorization middleware', () => {
  async function as(role: 'CUSTOMER' | 'LOCATION_MANAGER' | 'SUPER_ADMIN') {
    const email = `${role.toLowerCase()}@kinemax.test`;
    const user = await createUser({ email, role });
    const { app } = makeTestApp();
    const client = await browserClient(app);
    expect((await login(client, email)).status).toBe(200);
    return { app, client, user };
  }

  it('GET /api/admin/ping: 401 anonymous, 403 customer and manager, 200 super admin', async () => {
    const { app } = makeTestApp();
    await request(app).get('/api/admin/ping').expect(401);
    await (await as('CUSTOMER')).client.get('/api/admin/ping').expect(403);
    await (await as('LOCATION_MANAGER')).client.get('/api/admin/ping').expect(403);
    const res = await (await as('SUPER_ADMIN')).client.get('/api/admin/ping').expect(200);
    expect(res.body).toEqual({ ok: true, scope: 'admin' });
  });

  it('location routes: managers only for their own locations, admins everywhere', async () => {
    const [own, other] = [await createLocation('own'), await createLocation('other')];
    const manager = await as('LOCATION_MANAGER');
    await prisma.managerLocation.create({ data: { userId: manager.user.id, locationId: own.id } });
    const ping = (client: Client, id: string) => client.get(`/api/manage/locations/${id}/ping`);

    await ping(manager.client, own.id).expect(200);
    const denied = await ping(manager.client, other.id).expect(403);
    expect(denied.body).toEqual({
      error: { code: 'forbidden', message: 'You are not allowed to do this.' },
    });
    await ping(manager.client, 'not-a-uuid').expect(403);

    const admin = await as('SUPER_ADMIN');
    await ping(admin.client, other.id).expect(200);
    await ping((await as('CUSTOMER')).client, own.id).expect(403);
    await request(manager.app).get(`/api/manage/locations/${own.id}/ping`).expect(401);
  });
});

describe('responses never contain secrets', () => {
  it('no response body contains a password hash, password or session token', async () => {
    await createUser({ role: 'SUPER_ADMIN' });
    const { app, logger } = makeTestApp();
    const client = await browserClient(app);
    const texts: string[] = [];
    const record = (res: request.Response) => texts.push(res.text);
    const loginRes = await login(client);
    record(loginRes);
    const token = cookieValue(setCookie(loginRes, SESSION_COOKIE)) ?? '';
    record(await client.get('/api/auth/me'));
    record(await client.patch('/api/auth/me', { name: 'Admin' }));
    record(await client.get('/api/admin/ping'));
    const changed = await client.post('/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: 'brand-new-passphrase',
    });
    record(changed);
    for (const text of texts) {
      expect(text).not.toContain('$argon2');
      expect(text).not.toContain('passwordHash');
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain(token);
    }
    const logs = JSON.stringify([
      logger.info.mock.calls,
      logger.warn.mock.calls,
      logger.error.mock.calls,
    ]);
    for (const secret of [PASSWORD, 'brand-new-passphrase', token, 'ana@kinemax.test']) {
      expect(logs).not.toContain(secret);
    }
  });
});

describe('GET /api/auth/session', () => {
  it('answers 200 with the user or with null, never 401', async () => {
    await createUser();
    const { app } = makeTestApp();
    const client = await browserClient(app);
    const anonymous = await client.get('/api/auth/session').expect(200);
    expect(anonymous.body).toEqual({ user: null });
    expect(anonymous.headers['cache-control']).toBe('no-store');
    await login(client);
    const signedIn = await client.get('/api/auth/session').expect(200);
    expect((signedIn.body as { user: { email: string } }).user.email).toBe('ana@kinemax.test');
    expect(JSON.stringify(signedIn.body)).not.toContain('passwordHash');
  });
});
