import {
  authSessionResponseSchema,
  bookingResponseSchema,
  menuResponseSchema,
} from '@kinemax/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password.js';
import {
  createFixture,
  expectDbError,
  resetDatabase,
  SQLSTATE,
  type Fixture,
} from './db/helpers.js';
import { browserClient, makeTestApp, testPrisma } from './support/app.js';

// Food & drinks: the per-cinema menu and the optional food order of a held booking.

const prisma = testPrisma();
const PASSWORD = 'Kinemax-test-Passw0rd';
const MINUTE = 60_000;
const generous = { windowMs: MINUTE, max: 1000 };
let clock = Date.now();
const { app } = makeTestApp({
  now: () => new Date(clock),
  rateLimits: {
    loginPerIp: generous,
    loginPerEmailAndIp: generous,
    registerPerIp: generous,
    changePasswordPerUser: generous,
  },
  bookingRateLimits: { holdPerUser: generous, holdPerIp: generous },
});

let fx: Fixture;
let passwordHash: string;
let users = 0;
let items: Record<'popcorn' | 'drink' | 'combo' | 'elsewhere' | 'off', { id: string }>;
let otherLocationShowtimeId: string;

type Client = Awaited<ReturnType<typeof browserClient>>;

async function customer(): Promise<Client> {
  users += 1;
  const email = `ushqim${String(users)}@kinemax.test`;
  await prisma.user.create({ data: { email, name: 'Klient', passwordHash } });
  const client = await browserClient(app);
  const res = await client.post('/api/auth/login', { email, password: PASSWORD }).expect(200);
  client.token = authSessionResponseSchema.parse(res.body).csrfToken;
  return client;
}

async function heldBooking(client: Client, suite = false) {
  const res = await client
    .post(
      '/api/bookings/hold',
      suite
        ? { showtimeId: fx.suiteShowtime.id, wholeHall: true }
        : { showtimeId: fx.showtime.id, seatIds: [fx.seats.hall[0]?.id] },
    )
    .expect(201);
  return bookingResponseSchema.parse(res.body).booking;
}

const putFood = (client: Client, id: string, body: object) =>
  client.put(`/api/bookings/${id}/food`, body);
const line = (item: { id: string }, quantity = 1, extra: object = {}) => ({
  menuItemId: item.id,
  quantity,
  fulfillment: 'PICKUP_AT_COUNTER',
  ...extra,
});

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  clock = Date.now();
  await resetDatabase(prisma);
  fx = await createFixture(prisma);
  const validFrom = new Date('2026-01-01T00:00:00Z');
  await prisma.hallTypePrice.create({
    data: { hallTypeId: fx.hall.hallTypeId, priceCents: 500, validFrom },
  });
  await prisma.wholeHallPrice.create({
    data: { hallId: fx.suite.id, priceCents: 14_000, validFrom },
  });
  const item = (slug: string, category: 'POPCORN' | 'DRINK' | 'COMBO', isCombo = false) =>
    prisma.menuItem.create({
      data: { slug, nameSq: `Artikulli ${slug}`, nameEn: `Item ${slug}`, category, isCombo },
    });
  const popcorn = await item('popcorn', 'POPCORN');
  const drink = await item('drink', 'DRINK');
  const combo = await item('combo', 'COMBO', true);
  const elsewhere = await item('elsewhere', 'POPCORN');
  const off = await item('off', 'DRINK');
  await prisma.comboComponent.createMany({
    data: [
      { comboId: combo.id, componentId: popcorn.id, quantity: 1 },
      { comboId: combo.id, componentId: drink.id, quantity: 2 },
    ],
  });
  items = { popcorn, drink, combo, elsewhere, off };

  const other = await prisma.location.create({
    data: {
      slug: 'other-city',
      name: 'Kinemax Tjetër',
      city: 'Tjetër',
      address: 'Rruga 2',
      timeZone: 'Europe/Belgrade',
    },
  });
  await prisma.locationMenuItem.createMany({
    data: [
      { locationId: fx.location.id, menuItemId: popcorn.id, priceCents: 350 },
      { locationId: fx.location.id, menuItemId: drink.id, priceCents: 200 },
      { locationId: fx.location.id, menuItemId: combo.id, priceCents: 500 },
      { locationId: fx.location.id, menuItemId: off.id, priceCents: 100, isAvailable: false },
      // Offered only at the other cinema, and cheaper there.
      { locationId: other.id, menuItemId: elsewhere.id, priceCents: 300 },
      { locationId: other.id, menuItemId: popcorn.id, priceCents: 320 },
    ],
  });
  const otherHall = await prisma.hall.create({
    data: {
      locationId: other.id,
      hallTypeId: fx.hall.hallTypeId,
      name: 'Salla X',
      screenWidthM: 10,
      screenHeightM: 4,
      screenZ: 3,
    },
  });
  otherLocationShowtimeId = (
    await prisma.showtime.create({
      data: {
        movieId: fx.movie.id,
        hallId: otherHall.id,
        startsAt: fx.showtime.startsAt,
        endsAt: fx.showtime.endsAt,
        languageVersion: 'DUBBED_SQ',
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/locations/:slug/menu', () => {
  it("lists the cinema's available items at its prices, combos with their contents", async () => {
    const client = await browserClient(app);
    const res = await client.get('/api/locations/test-city/menu').expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    const menu = menuResponseSchema.parse(res.body);
    expect(menu.location).toEqual({ slug: 'test-city', name: 'Kinemax Test' });
    expect(menu.seatDelivery).toBeNull();
    // Categories in display order, the unavailable and the other cinema's items left out.
    expect(menu.items.map((i) => [i.slug, i.priceCents])).toEqual([
      ['popcorn', 350],
      ['drink', 200],
      ['combo', 500],
    ]);
    expect(menu.items.find((i) => i.isCombo)?.components).toEqual([
      { slug: 'drink', nameSq: 'Artikulli drink', nameEn: 'Item drink', quantity: 2 },
      { slug: 'popcorn', nameSq: 'Artikulli popcorn', nameEn: 'Item popcorn', quantity: 1 },
    ]);
    const other = menuResponseSchema.parse(
      (await client.get('/api/locations/other-city/menu').expect(200)).body,
    );
    expect(other.items.map((i) => [i.slug, i.priceCents])).toEqual([
      // Same category: cheaper first.
      ['elsewhere', 300],
      ['popcorn', 320],
    ]);
  });

  it('tells whether a showtime of that cinema brings food to the seat', async () => {
    const client = await browserClient(app);
    const standard = await client
      .get(`/api/locations/test-city/menu?showtime=${fx.showtime.id}`)
      .expect(200);
    expect(menuResponseSchema.parse(standard.body).seatDelivery).toBe(false);
    const suite = await client
      .get(`/api/locations/test-city/menu?showtime=${fx.suiteShowtime.id}`)
      .expect(200);
    expect(menuResponseSchema.parse(suite.body).seatDelivery).toBe(true);
  });

  it('answers 404 for unknown cinemas and showtimes of another cinema, 400 for bad input', async () => {
    const client = await browserClient(app);
    await client.get('/api/locations/nowhere/menu').expect(404);
    await client
      .get(`/api/locations/test-city/menu?showtime=${otherLocationShowtimeId}`)
      .expect(404);
    await client.get('/api/locations/test-city/menu?showtime=nope').expect(400);
    await client.get('/api/locations/test-city/menu?price=1').expect(400);
    await prisma.location.update({ where: { id: fx.location.id }, data: { isActive: false } });
    await client.get('/api/locations/test-city/menu').expect(404);
  });
});

describe('PUT /api/bookings/:id/food', () => {
  it('needs a session and a CSRF token', async () => {
    const client = await customer();
    const booking = await heldBooking(client);
    const anonymous = await browserClient(app);
    await putFood(anonymous, booking.id, { items: [] }).expect(401);
    await client.agent.put(`/api/bookings/${booking.id}/food`).send({ items: [] }).expect(403);
  });

  it('stores the food at the cinema prices and adds it to the total', async () => {
    const client = await customer();
    const booking = await heldBooking(client);
    expect(booking.food).toEqual([]);
    expect(booking.totalCents).toBe(500);
    const res = await putFood(client, booking.id, {
      items: [line(items.popcorn, 2), line(items.combo)],
    }).expect(200);
    const saved = bookingResponseSchema.parse(res.body).booking;
    expect(saved.food.map((f) => [f.nameSq, f.quantity, f.unitPriceCents, f.totalCents])).toEqual(
      expect.arrayContaining([
        ['Artikulli popcorn', 2, 350, 700],
        ['Artikulli combo', 1, 500, 500],
      ]),
    );
    expect(saved.food.every((f) => f.serveTiming === null)).toBe(true);
    expect([saved.ticketsCents, saved.foodCents, saved.totalCents]).toEqual([500, 1200, 1700]);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).totalCents).toBe(
      1700,
    );
  });

  it('replaces the list; an empty list removes the food (it is optional)', async () => {
    const client = await customer();
    const booking = await heldBooking(client);
    await putFood(client, booking.id, { items: [line(items.popcorn, 3)] }).expect(200);
    let saved = bookingResponseSchema.parse(
      (await putFood(client, booking.id, { items: [line(items.drink)] }).expect(200)).body,
    ).booking;
    expect(saved.food.map((f) => f.quantity)).toEqual([1]);
    expect(saved.totalCents).toBe(700);
    saved = bookingResponseSchema.parse(
      (await putFood(client, booking.id, { items: [] }).expect(200)).body,
    ).booking;
    expect([saved.food, saved.totalCents]).toEqual([[], 500]);
  });

  it('keeps the food in the total when the tickets change', async () => {
    const client = await customer();
    const booking = await heldBooking(client);
    await putFood(client, booking.id, { items: [line(items.drink, 2)] }).expect(200);
    const res = await client
      .put(`/api/bookings/${booking.id}/tickets`, {
        tickets: [{ seatId: fx.seats.hall[0]?.id, occupant: 1, category: 'STUDENT' }],
        ageRatingConfirmed: false,
      })
      .expect(200);
    const saved = bookingResponseSchema.parse(res.body).booking;
    expect([saved.ticketsCents, saved.foodCents, saved.totalCents]).toEqual([500, 400, 900]);
  });

  it('delivers to the seat only where the hall type allows it, always with a serve time', async () => {
    const client = await customer();
    const standard = await heldBooking(client);
    const delivery = { fulfillment: 'DELIVER_TO_SEAT', serveTiming: 'DURING_SHOW' };
    await putFood(client, standard.id, { items: [line(items.combo, 1, delivery)] }).expect(422);

    const suite = await heldBooking(client, true);
    const res = await putFood(client, suite.id, {
      items: [line(items.combo, 1, delivery), line(items.drink)],
    }).expect(200);
    const saved = bookingResponseSchema.parse(res.body).booking;
    expect(saved.food.map((f) => [f.fulfillment, f.serveTiming])).toEqual(
      expect.arrayContaining([
        ['DELIVER_TO_SEAT', 'DURING_SHOW'],
        ['PICKUP_AT_COUNTER', null],
      ]),
    );
    expect(saved.totalCents).toBe(14_000 + 500 + 200);
    // Seat delivery needs a serve time; counter pickup has none.
    await putFood(client, suite.id, {
      items: [line(items.combo, 1, { fulfillment: 'DELIVER_TO_SEAT' })],
    }).expect(400);
    await putFood(client, suite.id, {
      items: [line(items.combo, 1, { serveTiming: 'BEFORE_SHOW' })],
    }).expect(400);
    await putFood(client, suite.id, {
      items: [line(items.combo, 1, { ...delivery, serveTiming: 'LATER' })],
    }).expect(400);
  });

  it('only sells what this cinema offers right now', async () => {
    const client = await customer();
    const booking = await heldBooking(client);
    await putFood(client, booking.id, { items: [line(items.elsewhere)] }).expect(422);
    await putFood(client, booking.id, { items: [line(items.off)] }).expect(422);
    await prisma.menuItem.update({ where: { id: items.drink.id }, data: { isActive: false } });
    await putFood(client, booking.id, { items: [line(items.drink)] }).expect(422);
    await putFood(client, booking.id, {
      items: [line({ id: '0190f0a0-0000-7000-8000-00000000dead' })],
    }).expect(422);
  });

  it('limits quantities: 1-20 per item, 40 in total, each item once per fulfillment', async () => {
    const client = await customer();
    const booking = await heldBooking(client);
    for (const quantity of [0, 21, 1.5]) {
      await putFood(client, booking.id, { items: [line(items.popcorn, quantity)] }).expect(400);
    }
    await putFood(client, booking.id, {
      items: [line(items.popcorn, 20), line(items.drink, 20)],
    }).expect(200);
    await putFood(client, booking.id, {
      items: [line(items.popcorn, 20), line(items.drink, 20), line(items.combo, 1)],
    }).expect(400);
    await putFood(client, booking.id, {
      items: [line(items.popcorn), line(items.popcorn)],
    }).expect(400);
  });

  it('never takes a price, a name or any other field from the client', async () => {
    const client = await customer();
    const booking = await heldBooking(client);
    await putFood(client, booking.id, {
      items: [{ ...line(items.popcorn), unitPriceCents: 1 }],
    }).expect(400);
    await putFood(client, booking.id, { items: [], totalCents: 1 }).expect(400);
    await putFood(client, booking.id, { items: [{ ...line(items.popcorn), nameSq: 'x' }] }).expect(
      400,
    );
  });

  it("answers 404 for another user's booking and changes nothing", async () => {
    const owner = await customer();
    const booking = await heldBooking(owner);
    const stranger = await customer();
    await putFood(stranger, booking.id, { items: [line(items.popcorn)] }).expect(404);
    await putFood(stranger, '0190f0a0-0000-7000-8000-00000000beef', { items: [] }).expect(404);
    await putFood(stranger, 'not-a-uuid', { items: [] }).expect(400);
    expect(await prisma.bookingFoodItem.count()).toBe(0);
  });

  it('refuses an expired hold (410) and a released booking (409)', async () => {
    const client = await customer();
    const booking = await heldBooking(client);
    clock += 11 * MINUTE;
    await putFood(client, booking.id, { items: [line(items.popcorn)] }).expect(410);
    clock = Date.now();
    const second = await heldBooking(client);
    await client.delete(`/api/bookings/${second.id}/hold`).expect(204);
    await putFood(client, second.id, { items: [line(items.popcorn)] }).expect(409);
    expect(await prisma.bookingFoodItem.count()).toBe(0);
  });
});

describe('G13 serve timing in the database', () => {
  it('requires a serve time for seat delivery and none for counter pickup', async () => {
    const client = await customer();
    const booking = await heldBooking(client, true);
    const row = {
      bookingId: booking.id,
      menuItemId: items.popcorn.id,
      nameSq: 'Kokoshka',
      quantity: 1,
      unitPriceCents: 350,
    };
    await expectDbError(
      prisma.bookingFoodItem.create({ data: { ...row, fulfillment: 'DELIVER_TO_SEAT' } }),
      SQLSTATE.checkViolation,
    );
    await expectDbError(
      prisma.bookingFoodItem.create({
        data: { ...row, fulfillment: 'PICKUP_AT_COUNTER', serveTiming: 'BEFORE_SHOW' },
      }),
      SQLSTATE.checkViolation,
    );
    await prisma.bookingFoodItem.create({
      data: { ...row, fulfillment: 'DELIVER_TO_SEAT', serveTiming: 'BEFORE_SHOW' },
    });
    await prisma.bookingFoodItem.create({ data: { ...row, fulfillment: 'PICKUP_AT_COUNTER' } });
  });
});
