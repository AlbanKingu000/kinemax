import {
  adminUserResponseSchema,
  adminUsersResponseSchema,
  auditResponseSchema,
  authSessionResponseSchema,
} from '@kinemax/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../db/helpers.js';
import {
  createAdminFixture,
  expectRefused,
  GENEROUS_LIMITS,
  STAFF_PASSWORD,
  staffClients,
  type AdminFixture,
  type Client,
  type Role,
} from '../support/admin.js';
import { browserClient, makeTestApp, testPrisma } from '../support/app.js';

// Users and the audit log: super admin only, with the self / last-super-admin safeguards.

const prisma = testPrisma();
const { app } = makeTestApp(GENEROUS_LIMITS);
let fx: AdminFixture;
let clients: Record<Role, Client>;

beforeEach(async () => {
  await resetDatabase(prisma);
  fx = await createAdminFixture(prisma);
  clients = await staffClients(app, fx);
});

const patch = (id: string, body: object, client = clients.superAdmin) =>
  client.patch(`/api/admin/users/${id}`, body);
const sessionsOf = (userId: string) => prisma.session.count({ where: { userId } });

/** A second super admin, signed in. */
async function secondSuperAdmin() {
  const { passwordHash } = await prisma.user.findUniqueOrThrow({
    where: { id: fx.staff.superAdmin.id },
  });
  const user = await prisma.user.create({
    data: { email: 'admin2@kinemax.test', name: 'Admin Dy', role: 'SUPER_ADMIN', passwordHash },
  });
  const client = await browserClient(app);
  const res = await client.post('/api/auth/login', { email: user.email, password: STAFF_PASSWORD });
  client.token = authSessionResponseSchema.parse(res.body).csrfToken;
  return { user, client };
}

describe('/api/admin/users', () => {
  it('searches by name or email and role, for super admins only', async () => {
    const res = await clients.superAdmin.get('/api/admin/users?q=STAF&role=LOCATION_MANAGER');
    const body = adminUsersResponseSchema.parse(res.body);
    expect(body.users.map((u) => u.id).sort()).toEqual(
      [fx.staff.manager.id, fx.staff.otherManager.id].sort(),
    );
    expect(body.users.find((u) => u.id === fx.staff.manager.id)?.locationIds).toEqual([
      fx.location.id,
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    await expectRefused(clients, ['manager', 'customer', 'anonymous'], (c) =>
      c.get('/api/admin/users'),
    );
    await expectRefused(
      clients,
      ['manager', 'customer', 'anonymous'],
      (c) => c.patch(`/api/admin/users/${fx.staff.customer.id}`, { role: 'SUPER_ADMIN' }),
      () => prisma.user.findMany({ select: { role: true, isActive: true } }),
    );
  });

  it('changes a role with cinemas, ends that user’s sessions and audits it', async () => {
    const { customer } = fx.staff;
    expect(await sessionsOf(customer.id)).toBe(1);
    const res = await patch(customer.id, {
      role: 'LOCATION_MANAGER',
      locationIds: [fx.other.location.id],
    }).expect(200);
    expect(adminUserResponseSchema.parse(res.body).user).toMatchObject({
      role: 'LOCATION_MANAGER',
      locationIds: [fx.other.location.id],
    });
    expect(await sessionsOf(customer.id)).toBe(0);
    await clients.customer.get('/api/auth/me').expect(401);
    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'user.update' } });
    expect(entry).toMatchObject({
      actorId: fx.staff.superAdmin.id,
      entityId: customer.id,
      before: { role: 'CUSTOMER', isActive: true, locationIds: [] },
      after: { role: 'LOCATION_MANAGER', locationIds: [fx.other.location.id], sessionsRevoked: 1 },
    });

    // Back to customer: the cinemas go with the role.
    await patch(customer.id, { role: 'CUSTOMER' }).expect(200);
    expect(await prisma.managerLocation.count({ where: { userId: customer.id } })).toBe(0);
    // Cinemas are for managers only, and must exist.
    await patch(customer.id, { locationIds: [fx.location.id] }).expect(422);
    await patch(fx.staff.manager.id, {
      locationIds: ['0190f0a0-0000-7000-8000-000000000000'],
    }).expect(422);
    await patch('0190f0a0-0000-7000-8000-000000000000', { isActive: false }).expect(404);
    await patch(customer.id, {}).expect(400);
  });

  it('deactivating signs the user out everywhere; reactivating lets them back in', async () => {
    const { manager } = fx.staff;
    await patch(manager.id, { isActive: false }).expect(200);
    expect(await sessionsOf(manager.id)).toBe(0);
    await clients.manager.get('/api/admin/locations').expect(401);
    const login = (c: Client) =>
      c.post('/api/auth/login', { email: manager.email, password: STAFF_PASSWORD });
    expect((await login(await browserClient(app))).status).toBe(401);
    await patch(manager.id, { isActive: true }).expect(200);
    expect((await login(await browserClient(app))).status).toBe(200);
    // The cinemas survive the pause.
    expect(await prisma.managerLocation.count({ where: { userId: manager.id } })).toBe(1);
  });

  it('refuses changing your own role or deactivating yourself', async () => {
    const self = fx.staff.superAdmin.id;
    for (const body of [{ role: 'CUSTOMER' }, { isActive: false }]) {
      const res = await patch(self, body).expect(409);
      expect(res.body).toMatchObject({ error: { fields: [{ code: 'self' }] } });
    }
    expect(await sessionsOf(self)).toBe(1);
  });

  it('never leaves the system without an active super admin, even when two race', async () => {
    const second = await secondSuperAdmin();
    const results = await Promise.all([
      patch(second.user.id, { role: 'CUSTOMER' }),
      patch(fx.staff.superAdmin.id, { isActive: false }, second.client),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const loser = results.find((r) => r.status !== 200);
    // Either refused as the last one, or the loser was already signed out by the winner.
    expect([401, 403, 409]).toContain(loser?.status);
    if (loser?.status === 409)
      expect(loser.body).toMatchObject({ error: { fields: [{ code: 'last_super_admin' }] } });
    expect(await prisma.user.count({ where: { role: 'SUPER_ADMIN', isActive: true } })).toBe(1);
  });
});

describe('/api/admin/audit', () => {
  it('lists entries newest first with actor, entity type and date filters', async () => {
    await patch(fx.staff.otherManager.id, { locationIds: [fx.location.id] }).expect(200);
    await prisma.auditLog.create({
      data: {
        action: 'price.set',
        entityType: 'HallTypePrice',
        entityId: 'x',
        createdAt: new Date('2026-01-01T10:00:00Z'),
      },
    });
    const get = async (query: string) =>
      auditResponseSchema.parse((await clients.superAdmin.get(`/api/admin/audit${query}`)).body);

    const all = await get('');
    expect(all.entries.map((e) => e.action)).toEqual(['user.update', 'price.set']);
    expect(all.entityTypes).toEqual(['HallTypePrice', 'User']);
    expect(all.entries[0]?.actor).toMatchObject({ id: fx.staff.superAdmin.id });
    expect(all.entries[1]?.actor).toBeNull();

    expect((await get('?entityType=User')).total).toBe(1);
    expect((await get('?actor=ADMIN@kinemax')).entries.map((e) => e.action)).toEqual([
      'user.update',
    ]);
    // 2026-01-01 in Kosovo; the 10:00Z entry is 11:00 local.
    expect((await get('?from=2026-01-01&to=2026-01-01')).entries.map((e) => e.action)).toEqual([
      'price.set',
    ]);
    expect((await get('?from=2026-01-02&to=2026-01-31')).total).toBe(0);
    await clients.superAdmin.get('/api/admin/audit?from=yesterday').expect(400);
    await expectRefused(clients, ['manager', 'customer', 'anonymous'], (c) =>
      c.get('/api/admin/audit'),
    );
  });
});
