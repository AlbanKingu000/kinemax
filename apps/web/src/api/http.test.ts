import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiRequestError, setCsrfToken } from './http';
import { urlOf } from '../test/catalog';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
const error = (status: number, code: string, headers: Record<string, string> = {}) =>
  json({ error: { code, message: 'x' } }, status, headers);

function stub(handler: Handler) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(urlOf(input), init ?? {})),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}
const tokenOf = (init: RequestInit) => (init.headers as Record<string, string>)['x-csrf-token'];

afterEach(() => {
  setCsrfToken(null);
});

describe('apiRequest', () => {
  it('fetches a CSRF token once and sends it on every state-changing request', async () => {
    let issued = 0;
    const mock = stub((url) => {
      if (url === '/api/auth/csrf') return json({ csrfToken: `token-${String(++issued)}` });
      return new Response(null, { status: 204 });
    });
    await apiRequest('/api/auth/logout', { method: 'POST' });
    await apiRequest('/api/x', { method: 'DELETE' });
    await apiRequest('/api/y');
    const calls = mock.mock.calls.map(([input, init]) => [urlOf(input), tokenOf(init ?? {})]);
    expect(calls).toEqual([
      ['/api/auth/csrf', undefined],
      ['/api/auth/logout', 'token-1'],
      ['/api/x', 'token-1'],
      ['/api/y', undefined], // GET: no token
    ]);
  });

  it('uses a token handed over after login and keeps it in memory only', async () => {
    const mock = stub(() => new Response(null, { status: 204 }));
    setCsrfToken('fresh');
    await apiRequest('/api/auth/me', { method: 'PATCH', body: { name: 'A' } });
    expect(tokenOf(mock.mock.calls[0]?.[1] ?? {})).toBe('fresh');
    expect(JSON.stringify(window.localStorage)).not.toContain('fresh');
    expect(JSON.stringify(window.sessionStorage)).not.toContain('fresh');
  });

  it('retries exactly once with a new token after 403 csrf_invalid', async () => {
    let attempts = 0;
    const mock = stub((url) => {
      if (url === '/api/auth/csrf') return json({ csrfToken: 'new' });
      attempts += 1;
      return error(403, 'csrf_invalid');
    });
    setCsrfToken('stale');
    const failure = await apiRequest('/api/auth/me', { method: 'PATCH', body: {} }).catch(
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(ApiRequestError);
    expect((failure as ApiRequestError).code).toBe('csrf_invalid');
    expect(attempts).toBe(2);
    expect(mock.mock.calls.map(([input, init]) => tokenOf(init ?? {}) ?? urlOf(input))).toEqual([
      'stale',
      '/api/auth/csrf',
      'new',
    ]);
  });

  it('succeeds after the one retry', async () => {
    let attempts = 0;
    stub((url) => {
      if (url === '/api/auth/csrf') return json({ csrfToken: 'new' });
      attempts += 1;
      return attempts === 1 ? error(403, 'csrf_invalid') : json({ ok: true });
    });
    setCsrfToken('stale');
    await expect(apiRequest('/api/x', { method: 'POST' })).resolves.toBeUndefined();
    expect(attempts).toBe(2);
  });

  it('never retries other 403s, 401s or 429s and reports Retry-After', async () => {
    for (const [status, code, headers] of [
      [403, 'forbidden', {}],
      [401, 'unauthorized', {}],
      [429, 'rate_limited', { 'Retry-After': '540' }],
    ] as const) {
      setCsrfToken('t');
      let calls = 0;
      stub(() => {
        calls += 1;
        return error(status, code, headers);
      });
      const failure = (await apiRequest('/api/x', { method: 'POST' }).catch(
        (e: unknown) => e,
      )) as ApiRequestError;
      expect([failure.status, failure.code, calls]).toEqual([status, code, 1]);
      if (status === 429) expect(failure.retryAfterSeconds).toBe(540);
    }
  });

  it('turns network failures and garbage into ApiRequestError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    await expect(apiRequest('/api/x')).rejects.toMatchObject({ code: 'network', status: 0 });
    stub(() => new Response('<html>', { status: 502 }));
    await expect(apiRequest('/api/x')).rejects.toMatchObject({ code: 'unknown', status: 502 });
  });
});
