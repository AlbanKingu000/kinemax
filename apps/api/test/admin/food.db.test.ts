import { adminMenuResponseSchema, deliveriesResponseSchema, CSRF_HEADER } from '@kinemax/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateBookingCode } from '../../src/domain/booking-code.js';
import { resetDatabase, ticket } from '../db/helpers.js';
import {
  createAdminFixture,
  expectRefused,
  GENEROUS_LIMITS,
  staffClients,
  type AdminFixture,
  type Client,
  type Role,
} from '../support/admin.js';
import { APP_ORIGIN, makeTestApp, testPrisma } from '../support/app.js';
import { makePng } from '../support/images.js';

// Food in the admin panel: the menu, each cinema's offer, the seat-delivery list.

const prisma = testPrisma();
const NOW = new Date('2030-03-10T12:00:00Z'); // 13:00 in Kosovo
const { app } = makeTestApp({ ...GENEROUS_LIMITS, now: () => NOW });
let fx: AdminFixture;
let clients: Record<Role, Client>;

beforeEach(async () => {
  await resetDatabase(prisma);
  fx = await createAdminFixture(prisma);
  clients = await staffClients(app, fx);
});

const item = (slug: string, extra: object = {}) => ({
  slug,
  nameSq: `Artikull ${slug}`,
  nameEn: '',
  descriptionSq: null,
  descriptionEn: null,
  category: 'POPCORN',
  isActive: true,
  components: [],
  ...extra,
});
const create = async (slug: string, extra: object = {}) =>
  (
    (await clients.superAdmin.post('/api/admin/menu', item(slug, extra)).expect(201)).body as {
      item: { id: string };
    }
  ).item.id;

describe('the menu', () => {
  it('creates items and combos, and refuses bad combos and other roles', async () => {
    const popcorn = await create('kokoshka');
    const cola = await create('kola', { category: 'DRINK' });
    const combo = await create('kombo', {
      category: 'COMBO',
      components: [
        { componentId: popcorn, quantity: 1 },
        { componentId: cola, quantity: 2 },
      ],
    });
    const { items } = adminMenuResponseSchema.parse(
      (await clients.superAdmin.get('/api/admin/menu').expect(200)).body,
    );
    expect(items.find((i) => i.id === combo)).toMatchObject({
      isCombo: true,
      components: expect.arrayContaining([
        expect.objectContaining({ componentId: cola, quantity: 2 }),
      ]) as unknown,
    });
    // A combo needs contents, a single item none, and a combo cannot contain a combo.
    await clients.superAdmin.post('/api/admin/menu', item('x', { category: 'COMBO' })).expect(400);
    await clients.superAdmin
      .post('/api/admin/menu', item('y', { components: [{ componentId: popcorn, quantity: 1 }] }))
      .expect(400);
    await clients.superAdmin
      .post(
        '/api/admin/menu',
        item('z', { category: 'COMBO', components: [{ componentId: combo, quantity: 1 }] }),
      )
      .expect(422);
    expect(await prisma.auditLog.count({ where: { action: 'menu.create' } })).toBe(3);
    await expectRefused(
      clients,
      ['anonymous', 'customer', 'manager', 'otherManager'],
      (c) => c.post('/api/admin/menu', item('w')),
      () => prisma.menuItem.count(),
    );
  });

  it('deletes an item that was never ordered but only deactivates an ordered one', async () => {
    const fresh = await create('fresh');
    await clients.superAdmin.delete(`/api/admin/menu/${fresh}`).expect(204);
    const ordered = await create('ordered');
    await prisma.locationMenuItem.create({
      data: { locationId: fx.location.id, menuItemId: ordered, priceCents: 300 },
    });
    await paidWithFood(fx.showtime.id, ordered, 'PICKUP_AT_COUNTER');
    const refused = await clients.superAdmin.delete(`/api/admin/menu/${ordered}`);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ error: { fields: [{ code: 'has_orders' }] } });
    await clients.superAdmin
      .patch(`/api/admin/menu/${ordered}`, item('ordered', { isActive: false }))
      .expect(200);
    const menu = await clients.anonymous.get(`/api/locations/${fx.location.slug}/menu`).expect(200);
    expect(JSON.stringify(menu.body)).not.toContain('ordered');
    expect(await prisma.auditLog.count({ where: { action: 'menu.deactivate' } })).toBe(1);
  });

  it('takes menu images through the secure pipeline (WebP, checked sizes)', async () => {
    const id = await create('foto');
    const send = (bytes: Buffer) =>
      clients.superAdmin.agent
        .post(`/api/admin/menu/${id}/image`)
        .set('Origin', APP_ORIGIN)
        .set(CSRF_HEADER, clients.superAdmin.token)
        .set('Content-Type', 'image/svg+xml')
        .send(bytes);
    expect((await send(makePng(299, 300))).status).toBe(422);
    expect((await send(Buffer.from('<svg/>'))).status).toBe(422);
    const ok = await send(makePng(300, 300)).expect(200);
    expect((ok.body as { item: { imagePath: string } }).item.imagePath).toMatch(
      /^\/api\/media\/.+\.webp$/,
    );
  });
});

describe('a cinema’s offer', () => {
  it('lets a manager price and list items for their cinema only', async () => {
    const id = await create('nachos', { category: 'NACHOS' });
    await clients.manager
      .put(`/api/admin/menu/${id}/locations/${fx.location.id}`, {
        isAvailable: true,
        priceCents: 420,
      })
      .expect(200);
    const menu = await clients.anonymous.get(`/api/locations/${fx.location.slug}/menu`).expect(200);
    expect(JSON.stringify(menu.body)).toContain('420');
    const own = adminMenuResponseSchema.parse(
      (await clients.manager.get(`/api/admin/menu?location=${fx.location.id}`).expect(200)).body,
    );
    expect(own.items.find((i) => i.id === id)?.offer).toEqual({
      priceCents: 420,
      isAvailable: true,
    });
    await expectRefused(
      clients,
      ['otherManager', 'customer', 'anonymous'],
      (c) =>
        c.put(`/api/admin/menu/${id}/locations/${fx.location.id}`, {
          isAvailable: true,
          priceCents: 1,
        }),
      () => prisma.locationMenuItem.findMany(),
    );
    await expectRefused(clients, ['manager'], (c) =>
      c.get(`/api/admin/menu?location=${fx.other.location.id}`),
    );
    await clients.manager.get('/api/admin/menu').expect(403);
    await clients.manager
      .put(`/api/admin/menu/${id}/locations/${fx.location.id}`, {
        isAvailable: true,
        priceCents: -1,
      })
      .expect(400);
  });
});

/** A paid booking of one seat with food (DELIVER_TO_SEAT needs a serve time). */
async function paidWithFood(
  showtimeId: string,
  menuItemId: string,
  fulfillment: 'PICKUP_AT_COUNTER' | 'DELIVER_TO_SEAT',
  options: {
    serveTiming?: 'BEFORE_SHOW' | 'DURING_SHOW';
    seatIndex?: number;
    refund?: boolean;
  } = {},
) {
  const seat = fx.seats.hall[options.seatIndex ?? 0];
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        code: generateBookingCode(),
        userId: fx.user.id,
        showtimeId,
        holdExpiresAt: new Date(Date.now() + 600_000),
        totalCents: 750,
      },
    });
    await tx.seatReservation.create({
      data: { showtimeId, hallId: fx.hall.id, seatId: seat?.id ?? '', bookingId: booking.id },
    });
    await tx.bookingSeat.create({ data: ticket(booking.id, seat?.id ?? '', fx.adult) });
    await tx.bookingFoodItem.create({
      data: {
        bookingId: booking.id,
        menuItemId,
        nameSq: 'Kokoshka',
        quantity: 2,
        unitPriceCents: 150,
        fulfillment,
        serveTiming:
          fulfillment === 'DELIVER_TO_SEAT' ? (options.serveTiming ?? 'BEFORE_SHOW') : null,
      },
    });
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: 'CONFIRMED', confirmedAt: NOW },
    });
    if (options.refund) {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'REFUNDED', cancelledAt: NOW },
      });
    }
    return booking;
  });
}

describe('the seat-delivery list', () => {
  it('lists today’s paid seat deliveries by due time and marks them delivered', async () => {
    const popcorn = await create('kokoshka');
    const show = async (startsAt: string) =>
      prisma.showtime.create({
        data: {
          movieId: fx.movie.id,
          hallId: fx.hall.id,
          startsAt: new Date(startsAt),
          endsAt: new Date(new Date(startsAt).getTime() + 7_000_000),
          languageVersion: 'DUBBED_SQ',
        },
      });
    const early = await show('2030-03-10T14:00:00Z');
    const late = await show('2030-03-10T17:00:00Z');
    const during = await paidWithFood(early.id, popcorn, 'DELIVER_TO_SEAT', {
      serveTiming: 'DURING_SHOW',
    });
    const before = await paidWithFood(late.id, popcorn, 'DELIVER_TO_SEAT', { seatIndex: 1 });
    await paidWithFood(late.id, popcorn, 'DELIVER_TO_SEAT', { seatIndex: 2, refund: true });
    await paidWithFood(early.id, popcorn, 'PICKUP_AT_COUNTER', { seatIndex: 3 });
    // Tomorrow's show is not on today's list.
    await paidWithFood(fx.otherShowtime.id, popcorn, 'DELIVER_TO_SEAT', { seatIndex: 2 });

    const list = async (client = clients.manager) =>
      deliveriesResponseSchema.parse(
        (await client.get(`/api/admin/deliveries?location=${fx.location.id}`).expect(200)).body,
      ).orders;
    const orders = await list();
    expect(orders.map((o) => [o.bookingId, o.serveTiming, o.dueAt, o.seats])).toEqual([
      [during.id, 'DURING_SHOW', '2030-03-10T14:20:00.000Z', ['A1']],
      [before.id, 'BEFORE_SHOW', '2030-03-10T17:00:00.000Z', ['A2']],
    ]);
    expect(orders[0]?.items).toEqual([{ nameSq: 'Kokoshka', nameEn: null, quantity: 2 }]);

    const deliver = () =>
      clients.manager.post(`/api/admin/deliveries/${during.id}/delivered`, {
        serveTiming: 'DURING_SHOW',
      });
    expect((await deliver().expect(200)).body).toEqual({ delivered: 1 });
    expect((await deliver().expect(200)).body).toEqual({ delivered: 0 });
    expect((await list())[0]?.deliveredAt).toBe(NOW.toISOString());
    const row = await prisma.bookingFoodItem.findFirstOrThrow({ where: { bookingId: during.id } });
    expect(row.deliveredById).toBe(fx.staff.manager.id);
    expect(await prisma.auditLog.count({ where: { action: 'food.delivered' } })).toBe(1);

    await expectRefused(clients, ['otherManager', 'customer', 'anonymous'], (c) =>
      c.get(`/api/admin/deliveries?location=${fx.location.id}`),
    );
    await expectRefused(
      clients,
      ['otherManager', 'customer', 'anonymous'],
      (c) => c.post(`/api/admin/deliveries/${before.id}/delivered`, { serveTiming: 'BEFORE_SHOW' }),
      () => prisma.bookingFoodItem.findMany({ orderBy: { id: 'asc' } }),
    );
  });
});
