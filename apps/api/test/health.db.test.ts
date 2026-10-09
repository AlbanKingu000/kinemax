import { healthResponseSchema } from '@kinemax/shared';
import request from 'supertest';
import { afterAll, describe, expect, inject, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { databaseNameFromUrl } from '../src/db/database-url.js';
import { createDatabaseCheck, createPrismaClient } from '../src/db/prisma.js';

// Integration test against the real kinemax_test database (guarded in global-setup.ts).
const testDatabaseUrl = inject('testDatabaseUrl');
const prisma = createPrismaClient(testDatabaseUrl);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('health check against PostgreSQL', () => {
  it('only ever runs against a _test database', () => {
    expect(databaseNameFromUrl(testDatabaseUrl)).toMatch(/_test$/);
  });

  it('reports the database as up', async () => {
    const app = createApp({
      checkDatabase: createDatabaseCheck(prisma),
      logger: { info: vi.fn(), error: vi.fn() },
      corsAllowedOrigins: [],
    });
    const res = await request(app).get('/api/health').expect(200);
    expect(healthResponseSchema.parse(res.body)).toEqual({ status: 'ok', db: 'up' });
  });

  it('reports the database as down when it cannot connect', async () => {
    const unreachable = createPrismaClient('postgresql://kinemax:x@127.0.0.1:1/kinemax_test');
    const logger = { info: vi.fn(), error: vi.fn() };
    const app = createApp({
      checkDatabase: createDatabaseCheck(unreachable),
      logger,
      corsAllowedOrigins: [],
    });
    const res = await request(app).get('/api/health').expect(503);
    expect(res.body).toEqual({ status: 'error', db: 'down' });
    expect(logger.error).toHaveBeenCalledOnce();
    await unreachable.$disconnect();
  });
});
