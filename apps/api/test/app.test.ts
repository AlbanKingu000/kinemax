import { apiErrorResponseSchema, CSRF_HEADER, healthResponseSchema } from '@kinemax/shared';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { JSON_BODY_LIMIT } from '../src/app.js';
import { createErrorHandler } from '../src/http/errors.js';
import { APP_ORIGIN, browserClient, makeTestApp, testLogger, testPrisma } from './support/app.js';

const makeApp = makeTestApp;

afterAll(async () => {
  await testPrisma().$disconnect();
});

/** A POST to /api/health with a valid CSRF token and Origin, so body parsing is reached. */
async function protectedPost(app: ReturnType<typeof makeApp>['app'], body: string) {
  const client = await browserClient(app);
  return client.agent
    .post('/api/health')
    .set('Origin', APP_ORIGIN)
    .set(CSRF_HEADER, client.token)
    .set('Content-Type', 'application/json')
    .send(body);
}

describe('GET /api/health', () => {
  it('reports ok when the database answers', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/health').expect(200);
    expect(healthResponseSchema.parse(res.body)).toEqual({ status: 'ok', db: 'up' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('reports 503 and logs details server-side when the database is down', async () => {
    const { app, logger } = makeApp({
      checkDatabase: () => Promise.reject(new Error('connection refused at 127.0.0.1:5432')),
    });
    const res = await request(app).get('/api/health').expect(503);
    expect(res.body).toEqual({ status: 'error', db: 'down' });
    expect(JSON.stringify(res.body)).not.toContain('connection refused');
    expect(logger.error).toHaveBeenCalledWith(
      'Database health check failed',
      expect.objectContaining({ message: 'connection refused at 127.0.0.1:5432' }),
    );
  });
});

describe('security headers', () => {
  it('does not send x-powered-by and sets a strict CSP, frame and referrer headers', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    const csp = String(res.headers['content-security-policy']);
    for (const directive of [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      'frame-src https://www.youtube-nocookie.com',
    ]) {
      expect(csp).toContain(directive);
    }
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
    // Plain HTTP (development, tests): no HSTS.
    expect(res.headers['strict-transport-security']).toBeUndefined();
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('adds HSTS and upgrade-insecure-requests over HTTPS (secure cookies)', async () => {
    const { app } = makeApp({ cookieSecure: true });
    const res = await request(app).get('/api/health');
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(res.headers['content-security-policy']).toContain('upgrade-insecure-requests');
  });
});

describe('serving the built web app', () => {
  const dist = mkdtempSync(join(tmpdir(), 'kinemax-dist-'));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Kinemax</title>');
  writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'export {};');

  it('serves assets (cached for a year) and the app shell for client routes', async () => {
    const { app } = makeApp({ webDistDir: dist });
    const asset = await request(app).get('/assets/app-abc123.js').expect(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    for (const path of ['/', '/filmat/some-movie', '/admin/halls']) {
      const page = await request(app).get(path).expect(200);
      expect(page.text).toContain('<title>Kinemax</title>');
      expect(page.headers['cache-control']).toBe('no-cache');
      expect(page.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    }
  });

  it('keeps /api answers as JSON (an unknown API path is a JSON 404, not the app shell)', async () => {
    const { app } = makeApp({ webDistDir: dist });
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.headers['content-type']).toContain('application/json');
    await request(app).get('/api').expect(404);
  });
});

describe('CORS', () => {
  it('sends no CORS headers to a foreign origin by default', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers preflight requests from foreign origins without allowing them', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows only exact allowlisted origins, never a wildcard', async () => {
    const { app } = makeApp({ corsAllowedOrigins: ['https://admin.kinemax.example'] });
    const allowed = await request(app)
      .get('/api/health')
      .set('Origin', 'https://admin.kinemax.example');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://admin.kinemax.example');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const other = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('errors', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/does-not-exist').expect(404);
    expect(apiErrorResponseSchema.parse(res.body).error.code).toBe('not_found');
  });

  it('returns a generic 400 for malformed JSON without parser details', async () => {
    const { app } = makeApp();
    const res = await protectedPost(app, '{"broken":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'bad_request', message: 'The request could not be processed.' },
    });
  });

  it(`rejects JSON bodies over ${JSON_BODY_LIMIT} with 413`, async () => {
    const { app } = makeApp();
    const res = await protectedPost(app, JSON.stringify({ data: 'x'.repeat(200 * 1024) }));
    expect(res.status).toBe(413);
    expect(apiErrorResponseSchema.parse(res.body).error.code).toBe('payload_too_large');
  });
});

describe('createErrorHandler', () => {
  function appThatThrows(error: unknown) {
    const logger = testLogger();
    const app = express();
    app.get('/boom', () => {
      throw error;
    });
    app.use(createErrorHandler(logger));
    return { app, logger };
  }

  it('hides internal errors behind a generic 500 and logs the stack', async () => {
    const { app, logger } = appThatThrows(
      new Error('password authentication failed for "kinemax"'),
    );
    const res = await request(app).get('/boom').expect(500);
    expect(res.body).toEqual({
      error: { code: 'internal_error', message: 'Something went wrong.' },
    });
    expect(res.text).not.toContain('password');
    expect(res.text).not.toContain('at ');
    expect(logger.error).toHaveBeenCalledWith(
      'Unhandled error',
      expect.objectContaining({
        method: 'GET',
        path: '/boom',
        stack: expect.any(String) as unknown,
      }),
    );
  });

  it('treats non-Error throws and unexposed statuses as internal errors', async () => {
    const thrownString = appThatThrows('plain string');
    await request(thrownString.app).get('/boom').expect(500);
    expect(thrownString.logger.error).toHaveBeenCalledWith(
      'Unhandled error',
      expect.objectContaining({ value: 'plain string' }),
    );

    const hidden = appThatThrows(Object.assign(new Error('db detail'), { status: 400 }));
    const res = await request(hidden.app).get('/boom').expect(500);
    expect(res.text).not.toContain('db detail');
  });

  it('maps other exposed 4xx errors to a generic request_error', async () => {
    const { app } = appThatThrows(
      Object.assign(new Error('too many'), { status: 429, expose: true }),
    );
    const res = await request(app).get('/boom').expect(429);
    expect(res.body).toEqual({ error: { code: 'request_error', message: 'The request failed.' } });
  });

  it('delegates to Express when headers were already sent', async () => {
    const logger = testLogger();
    const app = express();
    app.get('/partial', (_req, res, next) => {
      res.status(200).write('partial');
      next(new Error('late failure'));
    });
    app.use(createErrorHandler(logger));
    await request(app)
      .get('/partial')
      .catch(() => undefined);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
