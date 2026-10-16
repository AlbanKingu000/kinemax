// A small fake of /api/auth for web tests: accounts in memory, real request shapes.
import type { AuthUser } from '@kinemax/shared';
import { vi } from 'vitest';
import { respond, stubCatalog, urlOf, type CatalogStub } from './catalog';

export interface FakeAuth {
  user: AuthUser | null;
  /** Answers for the next login/register/change-password calls (status + error code). */
  fail?: { path: string; status: number; code: string; headers?: Record<string, string> };
  requests: { method: string; path: string; body: unknown }[];
}

export const testUser = (extra: Partial<AuthUser> = {}): AuthUser => ({
  id: '0190f0a0-0000-7000-8000-0000000000aa',
  name: 'Ana Krasniqi',
  email: 'ana@kinemax.test',
  role: 'CUSTOMER',
  preferredLocale: 'sq',
  managedLocationIds: [],
  ...extra,
});

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

/** Stubs the catalog (as stubCatalog) plus /api/auth; returns the fake's state. */
export function stubAuth(initial: AuthUser | null = null, catalog: CatalogStub = {}): FakeAuth {
  const state: FakeAuth = { user: initial, requests: [] };
  const catalogFetch = stubCatalog(catalog).getMockImplementation();
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(urlOf(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const bookingApi = /^\/api\/(bookings|payments|me)\//.test(url.pathname);
    if (bookingApi && catalog.bookings) {
      state.requests.push({ method, path: url.pathname, body });
      return respond(catalog.bookings({ method, path: url.pathname, body }));
    }
    if (url.pathname.startsWith('/api/admin/') && catalog.admin) {
      state.requests.push({ method, path: url.pathname, body });
      return respond(catalog.admin({ method, path: url.pathname, url, body }));
    }
    if (!url.pathname.startsWith('/api/auth/')) {
      return catalogFetch ? catalogFetch(input) : json({}, 404);
    }
    state.requests.push({ method, path: url.pathname, body });
    const fail = state.fail;
    if (fail && fail.path === url.pathname) {
      state.fail = undefined;
      return json({ error: { code: fail.code, message: 'x' } }, fail.status, fail.headers);
    }
    const input2 = (body ?? {}) as Record<string, string>;
    switch (`${method} ${url.pathname}`) {
      case 'GET /api/auth/csrf':
        return json({ csrfToken: 'csrf-anon' });
      case 'GET /api/auth/session':
        return json({ user: state.user });
      case 'GET /api/auth/me':
        return state.user
          ? json({ user: state.user })
          : json({ error: { code: 'unauthorized', message: 'x' } }, 401);
      case 'POST /api/auth/login':
        state.user = testUser({ email: input2.email ?? '', preferredLocale: 'en' });
        return json({ user: state.user, csrfToken: 'csrf-session' });
      case 'POST /api/auth/register':
        state.user = testUser({
          name: input2.name ?? '',
          email: input2.email ?? '',
          preferredLocale: (input2.preferredLocale as 'sq' | 'en' | undefined) ?? 'sq',
        });
        return json({ user: state.user, csrfToken: 'csrf-session' }, 201);
      case 'POST /api/auth/logout':
      case 'POST /api/auth/logout-all':
        state.user = null;
        return new Response(null, { status: 204 });
      case 'PATCH /api/auth/me':
        if (!state.user) return json({ error: { code: 'unauthorized', message: 'x' } }, 401);
        state.user = { ...state.user, ...(input2 as Partial<AuthUser>) };
        return json({ user: state.user });
      case 'POST /api/auth/change-password':
        return state.user
          ? json({ user: state.user, csrfToken: 'csrf-rotated' })
          : json({ error: { code: 'unauthorized', message: 'x' } }, 401);
      default:
        return json({ error: { code: 'not_found', message: 'x' } }, 404);
    }
  });
  vi.stubGlobal('fetch', mock);
  return state;
}
