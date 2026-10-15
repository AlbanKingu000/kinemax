import {
  authSessionResponseSchema,
  bookingResponseSchema,
  checkoutResponseSchema,
  myBookingsResponseSchema,
  ticketResponseSchema,
} from '@kinemax/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password.js';
import { createFixture, resetDatabase, type Fixture } from './db/helpers.js';
import { browserClient, makeTestApp, testPrisma } from './support/app.js';

// "Biletat e mia": the user's paid bookings, one ticket by code, and the cancellation (refund).

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
const limits = {
  now: () => new Date(clock),
  rateLimits: authLimits,
  bookingRateLimits: { holdPerUser: generous, holdPerIp: generous },
  checkoutRateLimits: { paymentPerUser: generous, paymentPerIp: generous },
};
const { app, logger } = makeTestApp({
  ...limits,
  cancelRateLimits: { cancelPerUser: generous, cancelPerIp: generous },
});

let fx: Fixture;
let passwordHash: string;
let users = 0;

type Client = Awaited<ReturnType<typeof browserClient>>;

async function customer(target = app): Promise<Client> {
  users += 1;
  const email = `bileta${String(users)}@kinemax.test`;
  await prisma.user.create({ data: { email, name: 'Klient', passwordHash } });
  const client = await browserClient(target);
  const res = await client.post('/api/auth/login', { email, password: PASSWORD }).expect(200);
  client.token = authSessionResponseSchema.parse(res.body).csrfToken;
  return client;
}

/** Holds a seat and pays for it (demo): a CONFIRMED booking. */
async function paid(client: Client, seatIndex = 0, showtimeId = fx.showtime.id) {
  const hold = await client
    .post('/api/bookings/hold', { showtimeId, seatIds: [fx.seats.hall[seatIndex]?.id] })
    .expect(201);
  const { booking } = bookingResponseSchema.parse(hold.body);
  const checkout = checkoutResponseSchema.parse(
    (await client.post(`/api/bookings/${booking.id}/checkout`).expect(200)).body,
  );
  await client
    .post(`/api/payments/${checkout.payment.id}/simulate`, { outcome: 'success' })
    .expect(200);
  const row = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
  return { id: booking.id, code: row.code };
}

const cancel = (client: Client, id: string) => client.post(`/api/bookings/${id}/cancel`);
const startsAt = () => fx.showtime.startsAt.getTime();

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  clock = Date.now();
  await resetDatabase(prisma);
  fx = await createFixture(prisma);
  await prisma.hallTypePrice.create({
    data: {
      hallTypeId: fx.hall.hallTypeId,
      priceCents: 500,
      validFrom: new Date('2026-01-01T00:00:00Z'),
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/me/bookings', () => {
  it('needs a session', async () => {
    const anonymous = await browserClient(app);
    await anonymous.get('/api/me/bookings').expect(401);
    await anonymous.get('/api/me/bookings/ABCDEFGHJKMNPQRS').expect(401);
  });

  it("lists the user's paid bookings as upcoming, past and cancelled; holds never", async () => {
    const client = await customer();
    const first = await paid(client, 0);
    const second = await paid(client, 1);
    // A hold that was released is not a ticket.
    const released = bookingResponseSchema.parse(
      (
        await client
          .post('/api/bookings/hold', {
            showtimeId: fx.showtime.id,
            seatIds: [fx.seats.hall[2]?.id],
          })
          .expect(201)
      ).body,
    ).booking;
    await client.delete(`/api/bookings/${released.id}/hold`).expect(204);
    await cancel(client, second.id).expect(200);
    // Someone else's booking stays theirs.
    await paid(await customer(), 3);

    const res = await client.get('/api/me/bookings').expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    let lists = myBookingsResponseSchema.parse(res.body);
    expect(lists.upcoming.map((t) => t.code)).toEqual([first.code]);
    expect(lists.past).toEqual([]);
    expect(lists.cancelled.map((t) => [t.code, t.status])).toEqual([[second.code, 'REFUNDED']]);
    expect(lists.upcoming[0]?.cancellation).toEqual({
      allowed: true,
      until: new Date(startsAt() - 120 * MINUTE).toISOString(),
      refundCents: 500,
    });
    expect(lists.cancelled[0]?.cancellation).toBeNull();

    // After the show it is a past ticket, no longer cancellable.
    clock = fx.showtime.endsAt.getTime() + MINUTE;
    lists = myBookingsResponseSchema.parse((await client.get('/api/me/bookings').expect(200)).body);
    expect([lists.upcoming, lists.past.map((t) => t.code)]).toEqual([[], [first.code]]);
    expect(lists.past[0]?.cancellation).toBeNull();
  });
});

describe('GET /api/me/bookings/:code', () => {
  it("shows one of the user's tickets by its code; anything else is 404", async () => {
    const owner = await customer();
    const booking = await paid(owner);
    const res = await owner.get(`/api/me/bookings/${booking.code}`).expect(200);
    expect(ticketResponseSchema.parse(res.body).ticket).toMatchObject({
      id: booking.id,
      status: 'CONFIRMED',
      payment: { status: 'SUCCEEDED' },
    });
    const stranger = await customer();
    await stranger.get(`/api/me/bookings/${booking.code}`).expect(404);
    await owner.get('/api/me/bookings/not-a-code').expect(404);
    await owner.get('/api/me/bookings/ABCDEFGHJKMNPQRS').expect(404);
  });
});

describe('POST /api/bookings/:id/cancel', () => {
  it('refunds until exactly 120 minutes before the start: payment, booking, seats, audit', async () => {
    const client = await customer();
    const booking = await paid(client);
    clock = startsAt() - 120 * MINUTE;
    const res = await cancel(client, booking.id).expect(200);
    const { ticket } = ticketResponseSchema.parse(res.body);
    expect([ticket.status, ticket.cancellation, ticket.payment?.status]).toEqual([
      'REFUNDED',
      null,
      'REFUNDED',
    ]);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect([row.status, row.cancelledAt?.getTime()]).toEqual(['REFUNDED', clock]);
    const payment = await prisma.demoPayment.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect([payment.status, payment.refundedAt?.getTime()]).toEqual(['REFUNDED', clock]);
    // The trigger released the seat in the same transaction.
    expect(await prisma.seatReservation.count({ where: { bookingId: booking.id } })).toBe(0);
    const audit = await prisma.auditLog.findMany({ where: { entityId: booking.id } });
    expect(audit).toEqual([
      expect.objectContaining({
        action: 'booking.refund',
        entityType: 'Booking',
        before: { status: 'CONFIRMED', totalCents: 500 },
        after: expect.objectContaining({ status: 'REFUNDED', refundCents: 500 }) as unknown,
      }),
    ]);
    expect(audit[0]?.actorId).toBe(
      (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).userId,
    );
    expect(logger.info).toHaveBeenCalledWith('booking.refund', {
      bookingId: booking.id,
      refundCents: 500,
    });
  });

  it('refuses from 119 minutes before the start and changes nothing', async () => {
    const client = await customer();
    const booking = await paid(client);
    clock = startsAt() - 119 * MINUTE;
    const lists = myBookingsResponseSchema.parse(
      (await client.get('/api/me/bookings').expect(200)).body,
    );
    expect(lists.upcoming[0]?.cancellation?.allowed).toBe(false);
    await cancel(client, booking.id).expect(409);
    clock = startsAt() - 120 * MINUTE - 1;
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
      'CONFIRMED',
    );
    expect(await prisma.seatReservation.count({ where: { bookingId: booking.id } })).toBe(1);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it('counts in instants, whatever the cinema time zone (the cutoff setting is respected)', async () => {
    await prisma.location.update({
      where: { id: fx.location.id },
      data: { timeZone: 'America/New_York' },
    });
    await prisma.appSettings.update({ where: { id: 1 }, data: { cancellationCutoffMinutes: 180 } });
    const client = await customer();
    const booking = await paid(client);
    const { ticket } = ticketResponseSchema.parse(
      (await client.get(`/api/me/bookings/${booking.code}`).expect(200)).body,
    );
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(fx.showtime.startsAt);
    expect(ticket.localTime).toBe(local);
    expect(ticket.cancellation?.until).toBe(new Date(startsAt() - 180 * MINUTE).toISOString());
    clock = startsAt() - 179 * MINUTE;
    await cancel(client, booking.id).expect(409);
    clock = startsAt() - 180 * MINUTE;
    await cancel(client, booking.id).expect(200);
  });

  it('is idempotent: a second or parallel cancellation refunds once', async () => {
    const client = await customer();
    const booking = await paid(client);
    const results = await Promise.all([1, 2, 3, 4].map(() => cancel(client, booking.id)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    await cancel(client, booking.id).expect(200);
    expect(await prisma.auditLog.count({ where: { entityId: booking.id } })).toBe(1);
    expect(
      (await prisma.demoPayment.findMany({ where: { bookingId: booking.id } })).map(
        (p) => p.status,
      ),
    ).toEqual(['REFUNDED']);
  });

  it('frees the seat for everyone else at once', async () => {
    const owner = await customer();
    const booking = await paid(owner);
    const other = await customer();
    const seatIds = [fx.seats.hall[0]?.id];
    await other.post('/api/bookings/hold', { showtimeId: fx.showtime.id, seatIds }).expect(409);
    await cancel(owner, booking.id).expect(200);
    await other.post('/api/bookings/hold', { showtimeId: fx.showtime.id, seatIds }).expect(201);
  });

  it("answers 404 for another user's booking, 409 for a hold, and is rate limited", async () => {
    const owner = await customer();
    const booking = await paid(owner);
    const stranger = await customer();
    await cancel(stranger, booking.id).expect(404);
    await cancel(stranger, '0190f0a0-0000-7000-8000-00000000beef').expect(404);
    await cancel(stranger, 'nope').expect(400);
    await owner.agent.post(`/api/bookings/${booking.id}/cancel`).expect(403);
    const hold = bookingResponseSchema.parse(
      (
        await stranger
          .post('/api/bookings/hold', {
            showtimeId: fx.showtime.id,
            seatIds: [fx.seats.hall[1]?.id],
          })
          .expect(201)
      ).body,
    ).booking;
    await cancel(stranger, hold.id).expect(409);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
      'CONFIRMED',
    );

    const limited = makeTestApp({
      ...limits,
      cancelRateLimits: { cancelPerUser: { windowMs: MINUTE, max: 1 }, cancelPerIp: generous },
    });
    const client = await customer(limited.app);
    await cancel(client, '0190f0a0-0000-7000-8000-00000000beef').expect(404);
    await cancel(client, '0190f0a0-0000-7000-8000-00000000beef').expect(429);
  });
});
