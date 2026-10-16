// The route inventory: every route registered under /api is read from the app's router stack and
// checked automatically, so a new route cannot slip through without sign-in, admin role, CSRF,
// input validation or (for sensitive writes) a rate limit. A new public route or a write without
// input must be added to an allowlist below on purpose.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { authSessionResponseSchema, CSRF_HEADER } from '@kinemax/shared';
import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { resetDatabase } from './db/helpers.js';
import {
  createAdminFixture,
  GENEROUS_LIMITS,
  STAFF_PASSWORD,
  staffClients,
  type AdminFixture,
  type Client,
  type Role,
} from './support/admin.js';
import { APP_ORIGIN, browserClient, makeTestApp, setCookie, testPrisma } from './support/app.js';

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle: { stack?: Layer[] };
  mountPath?: string;
}
interface RouterProto {
  use: (this: { stack: Layer[] }, ...args: unknown[]) => unknown;
}
interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
}

/**
 * Builds an app while recording the mount path of every router.use() (router 2.x keeps only a
 * matcher function), then walks the stack. Express's app.router is this same Router.
 */
function routesOf(build: () => express.Express): Route[] {
  const proto = express.Router.prototype as unknown as RouterProto;
  const original = proto.use;
  proto.use = function (this: { stack: Layer[] }, ...args: unknown[]) {
    const before = this.stack.length;
    const result = original.apply(this, args);
    const path = typeof args[0] === 'string' ? args[0] : '/';
    for (const layer of this.stack.slice(before)) layer.mountPath = path;
    return result;
  };
  let app: express.Express;
  try {
    app = build();
  } finally {
    proto.use = original;
  }
  const routes: Route[] = [];
  const walk = (stack: Layer[], prefix: string) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          routes.push({
            method: method.toUpperCase() as Route['method'],
            path: prefix + layer.route.path,
          });
        }
      } else if (layer.handle.stack) {
        walk(layer.handle.stack, prefix + (layer.mountPath === '/' ? '' : (layer.mountPath ?? '')));
      }
    }
  };
  walk((app as unknown as { router: { stack: Layer[] } }).router.stack, '');
  return routes;
}

const key = (r: Route) => `${r.method} ${r.path}`;
const isWrite = (r: Route) => r.method !== 'GET';
const withParams = (path: string, value: string) => path.replace(/:\w+/g, value);
const SOME_UUID = '00000000-0000-4000-8000-000000000000';

/** Reachable without signing in. Everything else must answer 401 to an anonymous visitor. */
const PUBLIC = new Set([
  'GET /api/health',
  'GET /api/auth/csrf',
  'GET /api/auth/session',
  'POST /api/auth/register',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'GET /api/locations',
  'GET /api/locations/:slug/menu',
  'GET /api/movies',
  'GET /api/movies/:slug',
  'GET /api/featured',
  'GET /api/showtimes',
  'GET /api/showtimes/:id',
  'GET /api/showtimes/:id/seatmap',
  'GET /api/media/:file',
]);

/** Writes without any input (no params, no body): nothing to validate. */
const NO_INPUT = new Set(['POST /api/auth/logout', 'POST /api/auth/logout-all']);

/** Sensitive writes outside /api/admin that must be rate limited (every admin write is). */
const RATE_LIMITED = new Set([
  'POST /api/auth/register',
  'POST /api/auth/login',
  'POST /api/auth/change-password',
  'POST /api/bookings/hold',
  'POST /api/bookings/:id/checkout',
  'POST /api/payments/:id/simulate',
  'POST /api/bookings/:id/cancel',
]);

const prisma = testPrisma();
const { app } = makeTestApp(GENEROUS_LIMITS);
const routes = routesOf(() => makeTestApp(GENEROUS_LIMITS).app);
let clients: Record<Role, Client>;
let fx: AdminFixture;

beforeAll(async () => {
  await resetDatabase(prisma);
  fx = await createAdminFixture(prisma);
  clients = await staffClients(app, fx);
});

const send = (client: Client, route: Route, path: string, body?: unknown) => {
  const verb = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
  if (verb === 'get') return client.get(path);
  return client.agent[verb](path)
    .set('Origin', APP_ORIGIN)
    .set(CSRF_HEADER, client.token)
    .send(body as object);
};

describe('the route inventory', () => {
  it('finds every route (and the allowlists name only real routes)', () => {
    expect(routes.length).toBeGreaterThan(60);
    const all = new Set(routes.map(key));
    for (const name of [...PUBLIC, ...NO_INPUT, ...RATE_LIMITED]) expect(all).toContain(name);
    expect(routes.every((r) => r.path.startsWith('/api/'))).toBe(true);
    expect([...PUBLIC].some((name) => name.includes('/api/admin'))).toBe(false);
  });

  it('refuses anonymous visitors (401) on every non-public route', async () => {
    for (const route of routes.filter((r) => !PUBLIC.has(key(r)))) {
      const res = await send(clients.anonymous, route, withParams(route.path, SOME_UUID), {});
      expect(res.status, key(route)).toBe(401);
    }
  });

  it('never lets a customer reach /api/admin (403)', async () => {
    for (const route of routes.filter((r) => r.path.startsWith('/api/admin'))) {
      const res = await send(clients.customer, route, withParams(route.path, SOME_UUID), {});
      expect(res.status, key(route)).toBe(403);
    }
  });

  it('requires a CSRF token on every POST/PUT/PATCH/DELETE, even for a super admin', async () => {
    for (const route of routes.filter(isWrite)) {
      const verb = route.method.toLowerCase() as 'post' | 'put' | 'patch' | 'delete';
      const res = await clients.superAdmin.agent[verb](withParams(route.path, SOME_UUID))
        .set('Origin', APP_ORIGIN)
        .send({});
      expect(res.status, key(route)).toBe(403);
      expect(res.body, key(route)).toEqual({
        error: { code: 'csrf_invalid', message: 'The request was blocked.' },
      });
    }
  });

  it('validates every input: malformed params or bodies get a 4xx, never a 2xx or 500', async () => {
    for (const route of routes.filter((r) => !NO_INPUT.has(key(r)))) {
      const malformedParams = route.path.includes(':');
      const results = [];
      if (malformedParams) {
        results.push(await send(clients.superAdmin, route, withParams(route.path, 'x%00'), {}));
      }
      if (isWrite(route)) {
        // An array is valid JSON but never a valid request body.
        results.push(await send(clients.superAdmin, route, withParams(route.path, SOME_UUID), [1]));
      }
      for (const res of results) {
        expect(res.status, key(route)).toBeGreaterThanOrEqual(400);
        expect(res.status, key(route)).toBeLessThan(500);
        expect(JSON.stringify(res.body), key(route)).not.toMatch(/stack|prisma|sql/i);
      }
    }
  });

  it('reads request input only through zod (parseInput / safeParse) in the route code', () => {
    // Raw bytes of image uploads are checked by magic bytes and re-encoded (storeUploadedImage);
    // media file names by an exact regex.
    const allowed = /storeUploadedImage\(req\.body|const file = req\.params\.file/;
    const dir = join(import.meta.dirname, '../src/routes');
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) =>
      f.endsWith('.ts'),
    );
    for (const file of files) {
      const lines = readFileSync(join(dir, file), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!/req\.(body|query|params)\b/.test(line) || allowed.test(line)) return;
        const context = lines.slice(Math.max(0, i - 2), i + 1).join('\n');
        expect(context, `${file}:${String(i + 1)}`).toMatch(/parseInput\(|safeParse\(/);
      });
    }
  });

  it('rate limits auth, holds, checkout, payments, cancellations and every admin write', async () => {
    const zero = { windowMs: 60_000, max: 0 };
    const { app: limited } = makeTestApp({
      rateLimits: {
        loginPerIp: zero,
        loginPerEmailAndIp: zero,
        registerPerIp: zero,
        changePasswordPerUser: zero,
      },
      bookingRateLimits: { holdPerUser: zero, holdPerIp: zero },
      checkoutRateLimits: { paymentPerUser: zero, paymentPerIp: zero },
      cancelRateLimits: { cancelPerUser: zero, cancelPerIp: zero },
      adminRateLimits: { writePerUser: zero, sensitivePerUser: zero },
    });
    // A fresh super admin session (stored in the database) used on the zero-limit app.
    const signIn = await (
      await browserClient(app)
    ).post('/api/auth/login', {
      email: fx.staff.superAdmin.email,
      password: STAFF_PASSWORD,
    });
    const cookie = (setCookie(signIn, 'kinemax_session') ?? '').split(';')[0] ?? '';
    const token = authSessionResponseSchema.parse(signIn.body).csrfToken;
    const required = routes.filter(
      (r) => RATE_LIMITED.has(key(r)) || (isWrite(r) && r.path.startsWith('/api/admin')),
    );
    for (const route of required) {
      const verb = route.method.toLowerCase() as 'post' | 'put' | 'patch' | 'delete';
      const res = await request(limited)
        [verb](withParams(route.path, SOME_UUID))
        .set('Origin', APP_ORIGIN)
        .set(CSRF_HEADER, token)
        .set('Cookie', cookie)
        .send({});
      expect(res.status, key(route)).toBe(429);
    }
  });
});
