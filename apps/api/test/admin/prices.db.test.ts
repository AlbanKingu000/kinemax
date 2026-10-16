import { adminPricesResponseSchema } from '@kinemax/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { expectDbError, resetDatabase, SQLSTATE } from '../db/helpers.js';
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

// Prices and settings: versioned rules, never rewritten, never overlapping.

const prisma = testPrisma();
let clock = new Date('2030-01-01T10:00:00Z').getTime();
const { app } = makeTestApp({ ...GENEROUS_LIMITS, now: () => new Date(clock) });
let fx: AdminFixture;
let clients: Record<Role, Client>;

beforeEach(async () => {
  clock = new Date('2030-01-01T10:00:00Z').getTime();
  await resetDatabase(prisma);
  fx = await createAdminFixture(prisma);
  clients = await staffClients(app, fx);
});

const prices = async () =>
  adminPricesResponseSchema.parse(
    (await clients.superAdmin.get('/api/admin/prices').expect(200)).body,
  );
const base = (priceCents: number, locationId: string | null = null) =>
  clients.superAdmin.post('/api/admin/prices/base', {
    hallTypeId: fx.hall.hallTypeId,
    locationId,
    priceCents,
  });

describe('price versions', () => {
  it('closes the version in effect and starts a new one, keeping the history', async () => {
    await base(450).expect(201);
    clock += 60_000;
    await base(500).expect(201);
    const rows = await prisma.hallTypePrice.findMany({ orderBy: { validFrom: 'asc' } });
    expect(
      rows.map((r) => [r.priceCents, r.validFrom.toISOString(), r.validTo?.toISOString() ?? null]),
    ).toEqual([
      [450, '2030-01-01T10:00:00.000Z', '2030-01-01T10:01:00.000Z'],
      [500, '2030-01-01T10:01:00.000Z', null],
    ]);
    const current = await prices();
    expect(current.base.map((r) => r.priceCents)).toEqual([500]);
    // A per-cinema price is its own rule next to the global one.
    await base(400, fx.location.id).expect(201);
    expect((await prices()).base).toHaveLength(2);
    const log = await prisma.auditLog.findMany({ where: { action: 'price.base.set' } });
    expect(log).toHaveLength(3);
    expect(log[1]?.before).toMatchObject({ priceCents: 450 });
  });

  it('switches off a version that never took effect instead of overlapping', async () => {
    await base(450).expect(201);
    await base(470).expect(201); // same instant
    const rows = await prisma.hallTypePrice.findMany({ orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => [r.priceCents, r.isActive])).toEqual([
      [450, false],
      [470, true],
    ]);
  });

  it('refuses overlapping active versions in the database itself (G14)', async () => {
    const data = {
      hallTypeId: fx.hall.hallTypeId,
      priceCents: 450,
      validFrom: new Date('2030-01-01T00:00:00Z'),
    };
    await prisma.hallTypePrice.create({ data });
    await expectDbError(
      prisma.hallTypePrice.create({
        data: { ...data, validFrom: new Date('2030-06-01T00:00:00Z') },
      }),
      SQLSTATE.exclusionViolation,
    );
    await expectDbError(
      prisma.seatTypeSurcharge.createMany({
        data: [
          { seatType: 'VIP', amountCents: 100, validFrom: data.validFrom },
          { seatType: 'VIP', amountCents: 150, validFrom: data.validFrom },
        ],
      }),
      SQLSTATE.exclusionViolation,
    );
  });

  it('sets surcharges, discounts, suite prices and time windows, and ends a rule', async () => {
    await clients.superAdmin
      .post('/api/admin/prices/surcharge', { seatType: 'COUPLE', amountCents: 200 })
      .expect(201);
    await clients.superAdmin
      .post('/api/admin/prices/discount', {
        ticketCategoryId: fx.adult.id,
        kind: 'PERCENT',
        value: 20,
      })
      .expect(201);
    await clients.superAdmin
      .post('/api/admin/prices/suite', { hallId: fx.suite.id, priceCents: 14_000 })
      .expect(201);
    const window = {
      locationId: null,
      nameSq: 'Paradite',
      nameEn: '',
      daysOfWeek: [1, 2, 3],
      startMinute: 600,
      endMinute: 900,
      kind: 'PERCENT',
      value: -20,
      priority: 1,
    };
    const created = await clients.superAdmin
      .post('/api/admin/prices/adjustment', window)
      .expect(201);
    clock += 60_000;
    const replaced = await clients.superAdmin
      .put(`/api/admin/prices/adjustment/${(created.body as { id: string }).id}`, {
        ...window,
        value: -25,
      })
      .expect(200);
    let current = await prices();
    expect(current.surcharge).toEqual([
      expect.objectContaining({ seatType: 'COUPLE', amountCents: 200 }),
    ]);
    expect(current.adjustment).toEqual([
      expect.objectContaining({
        id: (replaced.body as { id: string }).id,
        value: -25,
        nameEn: null,
      }),
    ]);
    const suiteId = current.suite[0]?.id ?? '';
    clock += 60_000;
    await clients.superAdmin.post(`/api/admin/prices/suite/${suiteId}/end`).expect(204);
    current = await prices();
    expect(current.suite).toEqual([]);
    expect(await prisma.wholeHallPrice.count()).toBe(1);
  });

  it('validates each kind', async () => {
    const bad: [string, object, number][] = [
      ['discount', { ticketCategoryId: fx.adult.id, kind: 'PERCENT', value: 120 }, 400],
      ['surcharge', { seatType: 'VIP', amountCents: -1 }, 400],
      ['suite', { hallId: fx.hall.id, priceCents: 100 }, 422],
      ['base', { hallTypeId: fx.hall.hallTypeId, locationId: null, priceCents: 1, extra: 1 }, 400],
      [
        'adjustment',
        {
          locationId: null,
          nameSq: 'X',
          nameEn: null,
          daysOfWeek: [8],
          startMinute: 0,
          endMinute: 60,
          kind: 'PERCENT',
          value: 1,
          priority: 0,
        },
        400,
      ],
      [
        'adjustment',
        {
          locationId: null,
          nameSq: 'X',
          nameEn: null,
          daysOfWeek: [1],
          startMinute: 600,
          endMinute: 600,
          kind: 'PERCENT',
          value: 1,
          priority: 0,
        },
        400,
      ],
      ['nope', {}, 400],
    ];
    for (const [kind, body, status] of bad) {
      expect((await clients.superAdmin.post(`/api/admin/prices/${kind}`, body)).status, kind).toBe(
        status,
      );
    }
    await clients.superAdmin.post(`/api/admin/prices/base/${fx.hall.id}/end`).expect(404);
  });
});

describe('settings', () => {
  it('changes hold minutes and the cancellation cutoff with an audit row', async () => {
    await clients.superAdmin
      .put('/api/admin/settings', { seatHoldMinutes: 15, cancellationCutoffMinutes: 60 })
      .expect(200);
    expect(await prisma.appSettings.findUniqueOrThrow({ where: { id: 1 } })).toMatchObject({
      seatHoldMinutes: 15,
      cancellationCutoffMinutes: 60,
      updatedById: fx.staff.superAdmin.id,
    });
    expect(await prisma.auditLog.count({ where: { action: 'settings.update' } })).toBe(1);
    for (const body of [
      { seatHoldMinutes: 0, cancellationCutoffMinutes: 60 },
      { seatHoldMinutes: 61, cancellationCutoffMinutes: 60 },
    ]) {
      await clients.superAdmin.put('/api/admin/settings', body).expect(400);
    }
    expect((await clients.superAdmin.get('/api/admin/settings').expect(200)).body).toEqual({
      seatHoldMinutes: 15,
      cancellationCutoffMinutes: 60,
    });
  });
});

describe('scope', () => {
  it('belongs to the super admin only: managers, customers and visitors are refused', async () => {
    const unchanged = async () => [
      await prisma.hallTypePrice.findMany(),
      await prisma.appSettings.findMany(),
      await prisma.timePriceAdjustment.findMany(),
    ];
    const refused: Role[] = ['anonymous', 'customer', 'manager', 'otherManager'];
    await expectRefused(clients, refused, (c) => c.get('/api/admin/prices'));
    await expectRefused(clients, refused, (c) => c.get('/api/admin/settings'));
    await expectRefused(
      clients,
      refused,
      (c) =>
        c.post('/api/admin/prices/base', {
          hallTypeId: fx.hall.hallTypeId,
          locationId: fx.location.id,
          priceCents: 1,
        }),
      unchanged,
    );
    await expectRefused(
      clients,
      refused,
      (c) => c.put('/api/admin/settings', { seatHoldMinutes: 1, cancellationCutoffMinutes: 0 }),
      unchanged,
    );
  });
});
