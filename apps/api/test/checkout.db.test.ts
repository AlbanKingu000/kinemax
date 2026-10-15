import {
  authSessionResponseSchema,
  bookingResponseSchema,
  checkoutResponseSchema,
  ticketResponseSchema,
} from '@kinemax/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password.js';
import { createFixture, resetDatabase, type Fixture } from './db/helpers.js';
import { browserClient, makeTestApp, testPrisma } from './support/app.js';

// Demo checkout: the payment for the server total, simulated success/decline, the ticket.

const prisma = testPrisma();
const PASSWORD = 'Kinemax-test-Passw0rd';
const MINUTE = 60_000;
const generous = { windowMs: MINUTE, max: 1000 };
let clock = Date.now();
const authLimits = {
  loginPerIp: generous,
  loginPerEmailAndIp: generous,
  registerPerIp: generous,
  changePasswordPerUser: generous,
};
const { app, logger } = makeTestApp({
  now: () => new Date(clock),
  rateLimits: authLimits,
  bookingRateLimits: { holdPerUser: generous, holdPerIp: generous },
  checkoutRateLimits: { paymentPerUser: generous, paymentPerIp: generous },
});

let fx: Fixture;
let passwordHash: string;
let users = 0;
let adultsOnlyShowtimeId: string;
let popcornId: string;

type Client = Awaited<ReturnType<typeof browserClient>>;

async function customer(target = app): Promise<Client> {
  users += 1;
  const email = `pagesa${String(users)}@kinemax.test`;
  await prisma.user.create({ data: { email, name: 'Klient', passwordHash } });
  const client = await browserClient(target);
  const res = await client.post('/api/auth/login', { email, password: PASSWORD }).expect(200);
  client.token = authSessionResponseSchema.parse(res.body).csrfToken;
  return client;
}

async function held(client: Client, showtimeId = fx.showtime.id) {
  const seat = showtimeId === fx.showtime.id ? fx.seats.hall[0]?.id : fx.seats.otherHall[0]?.id;
  const res = await client.post('/api/bookings/hold', { showtimeId, seatIds: [seat] }).expect(201);
  return bookingResponseSchema.parse(res.body).booking;
}

const checkout = (client: Client, id: string) => client.post(`/api/bookings/${id}/checkout`);
const simulate = (client: Client, paymentId: string, outcome = 'success') =>
  client.post(`/api/payments/${paymentId}/simulate`, { outcome });

async function startPayment(client: Client, bookingId: string) {
  return checkoutResponseSchema.parse((await checkout(client, bookingId).expect(200)).body);
}

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
  const popcorn = await prisma.menuItem.create({
    data: { slug: 'popcorn', nameSq: 'Kokoshka', category: 'POPCORN' },
  });
  popcornId = popcorn.id;
  await prisma.locationMenuItem.create({
    data: { locationId: fx.location.id, menuItemId: popcorn.id, priceCents: 350 },
  });
  const adultsOnly = await prisma.movie.create({
    data: {
      slug: 'vetem-te-rritur',
      titleSq: 'Vetëm për të rritur',
      synopsisSq: 'Test.',
      durationMinutes: 90,
      ageRating: 'AGE_18',
      genres: ['DRAMA'],
      releaseDate: new Date('2026-01-01'),
      director: 'Test',
      status: 'NOW_SHOWING',
    },
  });
  const later = new Date(clock + 48 * 60 * MINUTE);
  adultsOnlyShowtimeId = (
    await prisma.showtime.create({
      data: {
        movieId: adultsOnly.id,
        hallId: fx.otherHall.id,
        startsAt: later,
        endsAt: new Date(later.getTime() + 120 * MINUTE),
        languageVersion: 'DUBBED_SQ',
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/bookings/:id/checkout', () => {
  it('needs a session and a CSRF token; other users get 404', async () => {
    const owner = await customer();
    const booking = await held(owner);
    const anonymous = await browserClient(app);
    await checkout(anonymous, booking.id).expect(401);
    await owner.agent.post(`/api/bookings/${booking.id}/checkout`).expect(403);
    const stranger = await customer();
    await checkout(stranger, booking.id).expect(404);
    expect(await prisma.demoPayment.count()).toBe(0);
  });

  it('opens one demo payment for the server total and reuses it', async () => {
    const client = await customer();
    const booking = await held(client);
    const first = await startPayment(client, booking.id);
    expect(first.payment).toMatchObject({ status: 'PENDING', amountCents: 500, currency: 'EUR' });
    const again = await startPayment(client, booking.id);
    expect(again.payment.id).toBe(first.payment.id);
    // The order changes: the open payment follows the new total, still only one.
    await client
      .put(`/api/bookings/${booking.id}/food`, {
        items: [{ menuItemId: popcornId, quantity: 2, fulfillment: 'PICKUP_AT_COUNTER' }],
      })
      .expect(200);
    const updated = await startPayment(client, booking.id);
    expect(updated.payment).toMatchObject({ id: first.payment.id, amountCents: 1200 });
    expect(await prisma.demoPayment.count()).toBe(1);
    const row = await prisma.demoPayment.findUniqueOrThrow({ where: { id: first.payment.id } });
    expect([row.provider, row.reference]).toEqual(['demo', expect.stringMatching(/^DEMO-/)]);
  });

  it('refuses a 15+/18+ booking without the age confirmation, on the server', async () => {
    const client = await customer();
    const booking = await held(client, adultsOnlyShowtimeId);
    await checkout(client, booking.id).expect(422);
    await client
      .put(`/api/bookings/${booking.id}/tickets`, {
        tickets: [{ seatId: fx.seats.otherHall[0]?.id, occupant: 1, category: 'ADULT' }],
        ageRatingConfirmed: true,
      })
      .expect(200);
    await checkout(client, booking.id).expect(200);
  });

  it('refuses an expired hold (410) and a released one (409)', async () => {
    const client = await customer();
    const booking = await held(client);
    clock += 11 * MINUTE;
    await checkout(client, booking.id).expect(410);
    clock = Date.now();
    const second = await held(client);
    await client.delete(`/api/bookings/${second.id}/hold`).expect(204);
    await checkout(client, second.id).expect(409);
    expect(await prisma.demoPayment.count()).toBe(0);
  });
});

describe('POST /api/payments/:id/simulate', () => {
  it('confirms the booking and the payment in one go; the seats stay booked', async () => {
    const client = await customer();
    const booking = await held(client);
    const { payment } = await startPayment(client, booking.id);
    const res = checkoutResponseSchema.parse((await simulate(client, payment.id).expect(200)).body);
    expect(res.payment.status).toBe('SUCCEEDED');
    expect(res.booking.status).toBe('CONFIRMED');
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.confirmedAt?.getTime()).toBe(clock);
    expect(await prisma.seatReservation.count({ where: { bookingId: booking.id } })).toBe(1);
    // A confirmed booking can no longer change its tickets or food.
    await client.put(`/api/bookings/${booking.id}/food`, { items: [] }).expect(409);
    expect(logger.info).toHaveBeenCalledWith(
      'payment.simulate',
      expect.objectContaining({ outcome: 'success' }),
    );
  });

  it('confirms exactly once under double clicks and parallel calls', async () => {
    const client = await customer();
    const booking = await held(client);
    const { payment } = await startPayment(client, booking.id);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => simulate(client, payment.id)),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
    const rows = await prisma.demoPayment.findMany({ where: { bookingId: booking.id } });
    expect(rows.map((p) => p.status)).toEqual(['SUCCEEDED']);
    const confirmed = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(confirmed.status).toBe('CONFIRMED');
    // Checking out again after the confirmation is not possible.
    await checkout(client, booking.id).expect(409);
  });

  it('keeps the hold after a decline, so the buyer can try again until it expires', async () => {
    const client = await customer();
    const booking = await held(client);
    const first = await startPayment(client, booking.id);
    const declined = checkoutResponseSchema.parse(
      (await simulate(client, first.payment.id, 'decline').expect(200)).body,
    );
    expect([declined.payment.status, declined.booking.status]).toEqual(['FAILED', 'HELD']);
    await simulate(client, first.payment.id, 'decline').expect(200);
    // A closed payment cannot succeed later; a new checkout opens a new one.
    await simulate(client, first.payment.id).expect(409);
    const second = await startPayment(client, booking.id);
    expect(second.payment.id).not.toBe(first.payment.id);
    await simulate(client, second.payment.id).expect(200);
    await simulate(client, second.payment.id, 'decline').expect(409);
    const statuses = (await prisma.demoPayment.findMany({ orderBy: { createdAt: 'asc' } })).map(
      (p) => p.status,
    );
    expect(statuses).toEqual(['FAILED', 'SUCCEEDED']);
  });

  it('answers 410 and confirms nothing after the hold expired', async () => {
    const client = await customer();
    const booking = await held(client);
    const { payment } = await startPayment(client, booking.id);
    clock += 11 * MINUTE;
    await simulate(client, payment.id).expect(410);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect([row.status, row.confirmedAt]).toEqual(['HELD', null]);
    expect((await prisma.demoPayment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(
      'FAILED',
    );
  });

  it('still answers 410 when only the database clock says the hold is over (trigger G9)', async () => {
    const client = await customer();
    const booking = await held(client);
    const { payment } = await startPayment(client, booking.id);
    // The API clock is a minute behind the database: only the trigger knows it is over.
    const expiredAt = new Date(Date.now() - 1000);
    await prisma.booking.update({ where: { id: booking.id }, data: { holdExpiresAt: expiredAt } });
    clock = expiredAt.getTime() - MINUTE;
    await simulate(client, payment.id).expect(410);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
      'HELD',
    );
  });

  it('cannot be tampered with: no amount from the client, and a changed total needs a new checkout', async () => {
    const client = await customer();
    const booking = await held(client);
    const { payment } = await startPayment(client, booking.id);
    await client
      .post(`/api/payments/${payment.id}/simulate`, { outcome: 'success', amountCents: 1 })
      .expect(400);
    await client.post(`/api/payments/${payment.id}/simulate`, { outcome: 'maybe' }).expect(400);
    // The order grows after the payment was opened: paying the old amount is refused.
    await client
      .put(`/api/bookings/${booking.id}/food`, {
        items: [{ menuItemId: popcornId, quantity: 1, fulfillment: 'PICKUP_AT_COUNTER' }],
      })
      .expect(200);
    await simulate(client, payment.id).expect(409);
    const fresh = await startPayment(client, booking.id);
    expect(fresh.payment.amountCents).toBe(850);
    await simulate(client, fresh.payment.id).expect(200);
    expect(
      (await prisma.demoPayment.findUniqueOrThrow({ where: { id: payment.id } })).amountCents,
    ).toBe(850);
  });

  it("answers 404 for another user's payment and for unknown ids", async () => {
    const owner = await customer();
    const booking = await held(owner);
    const { payment } = await startPayment(owner, booking.id);
    const stranger = await customer();
    await simulate(stranger, payment.id).expect(404);
    await simulate(stranger, '0190f0a0-0000-7000-8000-00000000beef').expect(404);
    await simulate(stranger, 'nope').expect(400);
    expect((await prisma.demoPayment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(
      'PENDING',
    );
  });

  it('is rate limited per user', async () => {
    const limited = makeTestApp({
      now: () => new Date(clock),
      rateLimits: authLimits,
      bookingRateLimits: { holdPerUser: generous, holdPerIp: generous },
      checkoutRateLimits: { paymentPerUser: { windowMs: MINUTE, max: 2 }, paymentPerIp: generous },
    });
    const client = await customer(limited.app);
    const booking = await held(client);
    const { payment } = await startPayment(client, booking.id);
    await simulate(client, payment.id, 'decline').expect(200);
    await simulate(client, payment.id, 'decline').expect(200);
    const res = await simulate(client, payment.id, 'decline').expect(429);
    expect(res.headers['retry-after']).toBeDefined();
  });
});

describe('GET /api/bookings/:id/ticket', () => {
  it('shows a paid booking as a ticket, only to its owner', async () => {
    const client = await customer();
    const booking = await held(client);
    await client.get(`/api/bookings/${booking.id}/ticket`).expect(404);
    await client
      .put(`/api/bookings/${booking.id}/food`, {
        items: [{ menuItemId: popcornId, quantity: 1, fulfillment: 'PICKUP_AT_COUNTER' }],
      })
      .expect(200);
    const { payment } = await startPayment(client, booking.id);
    await simulate(client, payment.id).expect(200);
    const res = await client.get(`/api/bookings/${booking.id}/ticket`).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const { ticket } = ticketResponseSchema.parse(res.body);
    const code = (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).code;
    expect(ticket).toMatchObject({
      code,
      status: 'CONFIRMED',
      movie: { slug: 'test-movie' },
      location: { name: 'Kinemax Test', timeZone: 'Europe/Belgrade' },
      hall: { name: 'Salla 1', hallTypeCode: 'STANDARD' },
      ticketsCents: 500,
      foodCents: 350,
      totalCents: 850,
      payment: { status: 'SUCCEEDED', amountCents: 850 },
    });
    expect(ticket.seats.map((s) => [s.row, s.number])).toEqual([['A', 1]]);
    expect(ticket.food.map((f) => f.nameSq)).toEqual(['Kokoshka']);
    // The local time of the start in the cinema's zone.
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Belgrade',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(fx.showtime.startsAt);
    expect(ticket.localTime).toBe(local);
    const stranger = await customer();
    await stranger.get(`/api/bookings/${booking.id}/ticket`).expect(404);
  });
});
