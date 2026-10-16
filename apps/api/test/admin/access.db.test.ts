import { adminLocationsResponseSchema } from '@kinemax/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../db/helpers.js';
import {
  createAdminFixture,
  expectRefused,
  GENEROUS_LIMITS,
  staffClients,
  type AdminFixture,
  type Client,
  type Role,
} from '../support/admin.js';
import { makeTestApp, testPrisma } from '../support/app.js';

// The admin shell: who may use /api/admin at all, and which cinemas each staff member sees.

const prisma = testPrisma();
const { app } = makeTestApp(GENEROUS_LIMITS);
let fx: AdminFixture;
let clients: Record<Role, Client>;

beforeEach(async () => {
  await resetDatabase(prisma);
  fx = await createAdminFixture(prisma);
  clients = await staffClients(app, fx);
});

describe('GET /api/admin/locations', () => {
  it('lists every cinema for a super admin', async () => {
    const res = await clients.superAdmin.get('/api/admin/locations').expect(200);
    const { locations } = adminLocationsResponseSchema.parse(res.body);
    expect(locations.map((l) => l.slug).sort()).toEqual(['other-city', 'test-city']);
  });

  it('lists only the assigned cinemas for a manager', async () => {
    const res = await clients.manager.get('/api/admin/locations').expect(200);
    const { locations } = adminLocationsResponseSchema.parse(res.body);
    expect(locations.map((l) => l.id)).toEqual([fx.location.id]);
  });

  it('refuses anonymous visitors (401) and customers (403)', async () => {
    await expectRefused(clients, ['anonymous', 'customer'], (c) => c.get('/api/admin/locations'));
  });
});

describe('the /api/admin scope', () => {
  it('answers 401/403 for unknown admin paths too, so nothing is revealed', async () => {
    await expectRefused(clients, ['anonymous', 'customer'], (c) => c.get('/api/admin/nope'));
    await clients.manager.get('/api/admin/nope').expect(404);
  });

  it('refuses admin writes without a CSRF token even for a super admin', async () => {
    const res = await clients.superAdmin.agent
      .post('/api/admin/locations')
      .set('Origin', 'http://localhost:5180')
      .send({});
    expect(res.status).toBe(403);
  });
});
