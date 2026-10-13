import {
  authSessionResponseSchema,
  bookingResponseSchema,
  seatMapResponseSchema,
} from '@kinemax/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password.js';
import { expireAllStaleHolds } from '../src/db/holds.js';
import { createFixture, holdSeats, resetDatabase, type Fixture } from './db/helpers.js';
import { browserClient, makeTestApp, testPrisma } from './support/app.js';

const prisma = testPrisma();
const PASSWORD = 'Kinemax-test-Passw0rd';
const MINUTE = 60_000;
const generous = { windowMs: MINUTE, max: 1000 };
let clock = Date.now();
const { app, logger } = makeTestApp({
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
let extraSeats: { id: string }[] = [];
let startedShowtimeId: string;
let adultsOnlyShowtimeId: string;

type Client = Awaited<ReturnType<typeof browserClient>>;

/** A new customer, signed in through the API. */
async function customer(): Promise<Client> {
  users += 1;
  const email = `klient${String(users)}@kinemax.test`;
  await prisma.user.create({ data: { email, name: 'Klient', passwordHash } });
  const client = await browserClient(app);
  const res = await client.post('/api/auth/login', { email, password: PASSWORD }).expect(200);
  client.token = authSessionResponseSchema.parse(res.body).csrfToken;
  return client;
}

const hold = (client: Client, body: object) => client.post('/api/bookings/hold', body);
const seatIds = (n: number) => (fx.seats.hall.slice(0, n) as { id: string }[]).map((s) => s.id);
const allTickets = (
  booking: ReturnType<typeof bookingResponseSchema.parse>['booking'],
  category = 'ADULT',
) =>
  booking.seats.flatMap((seat) =>
    seat.tickets.map((t) => ({ seatId: seat.seatId, occupant: t.occupant, category })),
  );

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
  await prisma.seatTypeSurcharge.create({
    data: { seatType: 'COUPLE', amountCents: 200, validFrom },
  });
  await prisma.wholeHallPrice.create({
    data: { hallId: fx.suite.id, priceCents: 14_000, validFrom },
  });
  await prisma.ticketCategoryDiscount.create({
    data: { ticketCategoryId: fx.student.id, kind: 'PERCENT', value: 20, validFrom },
  });
  await prisma.seat.createMany({
    data: [1, 2, 3, 4, 5].map((number) => ({
      hallId: fx.hall.id,
      rowLabel: 'C',
      number,
      seatType: 'STANDARD' as const,
      x: number,
      y: 7,
      z: 0.4,
    })),
  });
  extraSeats = await prisma.seat.findMany({ where: { hallId: fx.hall.id, rowLabel: 'C' } });
  const past = new Date(clock - 30 * MINUTE);
  startedShowtimeId = (
    await prisma.showtime.create({
      data: {
        movieId: fx.movie.id,
        hallId: fx.otherHall.id,
        startsAt: past,
        endsAt: new Date(past.getTime() + 120 * MINUTE),
        languageVersion: 'DUBBED_SQ',
      },
    })
  ).id;
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

describe('POST /api/bookings/hold', () => {
  it('needs a session and a CSRF token', async () => {
    const anonymous = await browserClient(app);
    await hold(anonymous, { showtimeId: fx.showtime.id, seatIds: seatIds(1) }).expect(401);
    const client = await customer();
    await client.agent
      .post('/api/bookings/hold')
      .send({ showtimeId: fx.showtime.id, seatIds: seatIds(1) })
      .expect(403);
  });

  it('holds seats for the configured minutes with ADULT tickets priced on the server', async () => {
    await prisma.appSettings.update({ where: { id: 1 }, data: { seatHoldMinutes: 7 } });
    const client = await customer();
    const res = await hold(client, {
      showtimeId: fx.showtime.id,
      seatIds: [...seatIds(1), fx.couple.id],
    }).expect(201);
    const { booking } = bookingResponseSchema.parse(res.body);
    expect(booking.status).toBe('HELD');
    expect(Date.parse(booking.holdExpiresAt ?? '')).toBe(clock + 7 * MINUTE);
    // 5,00 € seat + sofa 2 × 5,00 € + 2,00 € surcharge once
    expect(booking.totalCents).toBe(1700);
    const sofa = booking.seats.find((s) => s.seatId === fx.couple.id);
    expect(sofa?.tickets.map((t) => [t.occupant, t.category, t.priceCents])).toEqual([
      [1, 'ADULT', 500],
      [2, 'ADULT', 500],
    ]);
    expect(sofa?.surchargeCents).toBe(200);
    // Never reveals who holds the seat, but the seat is taken for everyone else.
    const map = seatMapResponseSchema.parse(
      (await client.get(`/api/showtimes/${fx.showtime.id}/seatmap`).expect(200)).body,
    );
    expect(map.seats.find((s) => s.id === seatIds(1)[0])?.status).toBe('TAKEN');
    expect(logger.info).toHaveBeenCalledWith('booking.hold', expect.objectContaining({ seats: 2 }));
  });

  it('lets exactly one of several parallel holds on the same seat win', async () => {
    const clients = await Promise.all([1, 2, 3, 4, 5].map(() => customer()));
    const results = await Promise.all(
      clients.map((c) => hold(c, { showtimeId: fx.showtime.id, seatIds: seatIds(2) })),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409]);
    for (const lost of results.filter((r) => r.status === 409)) {
      expect(
        (lost.body as { error: { takenSeatIds?: string[] } }).error.takenSeatIds?.sort(),
      ).toEqual(seatIds(2).sort());
    }
    expect(await prisma.seatReservation.count({ where: { showtimeId: fx.showtime.id } })).toBe(2);
  });

  it('expires stale holds of the showtime inside the hold transaction', async () => {
    const stale = await holdSeats(prisma, {
      userId: fx.user.id,
      showtimeId: fx.showtime.id,
      hallId: fx.hall.id,
      seatIds: seatIds(1),
      holdMinutes: -1,
    });
    const client = await customer();
    await hold(client, { showtimeId: fx.showtime.id, seatIds: seatIds(1) }).expect(201);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe(
      'EXPIRED',
    );
  });

  it('keeps one active hold per user: a new hold releases the previous one', async () => {
    const client = await customer();
    const first = bookingResponseSchema.parse(
      (await hold(client, { showtimeId: fx.showtime.id, seatIds: seatIds(1) }).expect(201)).body,
    ).booking;
    await hold(client, { showtimeId: fx.otherShowtime.id, seatIds: seatIds(2) }).expect(201);
    const previous = await prisma.booking.findUniqueOrThrow({ where: { id: first.id } });
    expect(previous.status).toBe('CANCELLED');
    expect(await prisma.seatReservation.count({ where: { bookingId: first.id } })).toBe(0);
    expect(await prisma.booking.count({ where: { status: 'HELD' } })).toBe(1);
  });

  it('refuses seats of another hall, more than 10 tickets, wrong hall modes and unknown shows', async () => {
    const client = await customer();
    const other = fx.seats.otherHall[0]?.id ?? '';
    await hold(client, { showtimeId: fx.showtime.id, seatIds: [other] }).expect(422);
    // 4 + 5 standard seats + a sofa = 11 tickets
    await hold(client, {
      showtimeId: fx.showtime.id,
      seatIds: [...seatIds(4), ...extraSeats.map((s) => s.id), fx.couple.id],
    }).expect(422);
    await hold(client, { showtimeId: fx.showtime.id, wholeHall: true }).expect(422);
    await hold(client, {
      showtimeId: fx.suiteShowtime.id,
      seatIds: [fx.seats.suite[0]?.id ?? ''],
    }).expect(422);
    await hold(client, { showtimeId: startedShowtimeId, seatIds: [other] }).expect(410);
    await hold(client, {
      showtimeId: '0190f0a0-0000-7000-8000-000000000000',
      seatIds: seatIds(1),
    }).expect(404);
    await hold(client, {
      showtimeId: fx.showtime.id,
      seatIds: [seatIds(1)[0], seatIds(1)[0]],
    }).expect(400);
    // Prices are never accepted from the client.
    await hold(client, {
      showtimeId: fx.showtime.id,
      seatIds: seatIds(1),
      totalCents: 1,
    }).expect(400);
    expect(await prisma.booking.count()).toBe(0);
  });

  it('holds a suite as a whole, once', async () => {
    const [first, second] = await Promise.all([customer(), customer()]);
    const res = await hold(first, { showtimeId: fx.suiteShowtime.id, wholeHall: true }).expect(201);
    const { booking } = bookingResponseSchema.parse(res.body);
    expect(booking.isWholeHall).toBe(true);
    expect(booking.wholeHallPriceCents).toBe(14_000);
    expect(booking.totalCents).toBe(14_000);
    await hold(second, { showtimeId: fx.suiteShowtime.id, wholeHall: true }).expect(409);
  });

  it('is rate limited per user', async () => {
    const limited = makeTestApp({
      rateLimits: {
        loginPerIp: generous,
        loginPerEmailAndIp: generous,
        registerPerIp: generous,
        changePasswordPerUser: generous,
      },
      bookingRateLimits: { holdPerUser: { windowMs: MINUTE, max: 1 }, holdPerIp: generous },
    });
    await prisma.user.create({ data: { email: 'shpejt@kinemax.test', name: 'S', passwordHash } });
    const client = await browserClient(limited.app);
    const login = await client
      .post('/api/auth/login', { email: 'shpejt@kinemax.test', password: PASSWORD })
      .expect(200);
    client.token = authSessionResponseSchema.parse(login.body).csrfToken;
    await hold(client, { showtimeId: fx.showtime.id, seatIds: seatIds(1) }).expect(201);
    const res = await hold(client, { showtimeId: fx.showtime.id, seatIds: seatIds(1) }).expect(429);
    expect(res.headers['retry-after']).toBeDefined();
  });
});

describe('GET /api/bookings/:id and /current', () => {
  it('shows a booking to its owner only (404 for anyone else, never 403)', async () => {
    const [owner, stranger] = await Promise.all([customer(), customer()]);
    const { booking } = bookingResponseSchema.parse(
      (await hold(owner, { showtimeId: fx.showtime.id, seatIds: seatIds(1) }).expect(201)).body,
    );
    const mine = bookingResponseSchema.parse(
      (await owner.get(`/api/bookings/${booking.id}`).expect(200)).body,
    );
    expect(mine.booking.categories.map((c) => c.code)).toEqual(['ADULT', 'STUDENT']);
    await stranger.get(`/api/bookings/${booking.id}`).expect(404);
    await stranger
      .put(`/api/bookings/${booking.id}/tickets`, {
        tickets: allTickets(booking),
        ageRatingConfirmed: false,
      })
      .expect(404);
    await stranger.delete(`/api/bookings/${booking.id}/hold`).expect(404);
    expect((await owner.get('/api/bookings/current').expect(200)).body).toMatchObject({
      booking: { id: booking.id },
    });
    expect((await stranger.get('/api/bookings/current').expect(200)).body).toEqual({
      booking: null,
    });
  });

  it('reports an expired hold as EXPIRED', async () => {
    const client = await customer();
    const { booking } = bookingResponseSchema.parse(
      (await hold(client, { showtimeId: fx.showtime.id, seatIds: seatIds(1) }).expect(201)).body,
    );
    clock += 11 * MINUTE;
    const later = bookingResponseSchema.parse(
      (await client.get(`/api/bookings/${booking.id}`).expect(200)).body,
    );
    expect(later.booking.status).toBe('EXPIRED');
    expect((await client.get('/api/bookings/current').expect(200)).body).toEqual({ booking: null });
  });
});

describe('PUT /api/bookings/:id/tickets', () => {
  it('prices the chosen categories on the server and stores the snapshots', async () => {
    const client = await customer();
    const { booking } = bookingResponseSchema.parse(
      (
        await hold(client, {
          showtimeId: fx.showtime.id,
          seatIds: [...seatIds(1), fx.couple.id],
        }).expect(201)
      ).body,
    );
    const tickets = allTickets(booking).map((t) =>
      t.seatId === fx.couple.id && t.occupant === 2 ? { ...t, category: 'STUDENT' } : t,
    );
    const res = await client
      .put(`/api/bookings/${booking.id}/tickets`, { tickets, ageRatingConfirmed: false })
      .expect(200);
    const updated = bookingResponseSchema.parse(res.body).booking;
    // 5,00 + (5,00 + 4,00 student) + 2,00 sofa
    expect(updated.totalCents).toBe(1600);
    const rows = await prisma.bookingSeat.findMany({ where: { bookingId: booking.id } });
    expect(rows.map((r) => r.ticketCategoryCode).sort()).toEqual(['ADULT', 'ADULT', 'STUDENT']);
    expect(rows.reduce((sum, r) => sum + r.unitPriceCents + r.seatSurchargeCents, 0)).toBe(1600);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).totalCents).toBe(
      1600,
    );
  });

  it('never accepts prices from the client and needs exactly the tickets of every seat', async () => {
    const client = await customer();
    const { booking } = bookingResponseSchema.parse(
      (
        await hold(client, {
          showtimeId: fx.showtime.id,
          seatIds: [...seatIds(1), fx.couple.id],
        }).expect(201)
      ).body,
    );
    const tickets = allTickets(booking);
    const put = (body: object) => client.put(`/api/bookings/${booking.id}/tickets`, body);
    await put({
      tickets: tickets.map((t) => ({ ...t, priceCents: 1 })),
      ageRatingConfirmed: false,
    }).expect(400);
    await put({ tickets, ageRatingConfirmed: false, totalCents: 1 }).expect(400);
    // A sofa needs both tickets.
    await put({
      tickets: tickets.filter((t) => !(t.seatId === fx.couple.id && t.occupant === 2)),
      ageRatingConfirmed: false,
    }).expect(422);
    await put({ tickets: [...tickets, tickets[0]], ageRatingConfirmed: false }).expect(422);
    await put({
      tickets: [...tickets, { seatId: seatIds(2)[1], occupant: 1, category: 'ADULT' }],
      ageRatingConfirmed: false,
    }).expect(422);
    await put({
      tickets: tickets.map((t) => ({ ...t, category: 'VIP_GUEST' })),
      ageRatingConfirmed: false,
    }).expect(422);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).totalCents).toBe(
      1700,
    );
  });

  it('cannot change an expired or released hold', async () => {
    const client = await customer();
    const { booking } = bookingResponseSchema.parse(
      (await hold(client, { showtimeId: fx.showtime.id, seatIds: seatIds(1) }).expect(201)).body,
    );
    const body = { tickets: allTickets(booking, 'STUDENT'), ageRatingConfirmed: false };
    clock += 11 * MINUTE;
    await client.put(`/api/bookings/${booking.id}/tickets`, body).expect(410);
    clock -= 11 * MINUTE;
    await client.delete(`/api/bookings/${booking.id}/hold`).expect(204);
    await client.put(`/api/bookings/${booking.id}/tickets`, body).expect(409);
  });

  it('stores the age confirmation only for 15+ and 18+ films', async () => {
    const client = await customer();
    const other = fx.seats.otherHall[0]?.id ?? '';
    const adults = bookingResponseSchema.parse(
      (await hold(client, { showtimeId: adultsOnlyShowtimeId, seatIds: [other] }).expect(201)).body,
    ).booking;
    expect(adults.ageConfirmationRequired).toBe(true);
    const confirmed = bookingResponseSchema.parse(
      (
        await client
          .put(`/api/bookings/${adults.id}/tickets`, {
            tickets: allTickets(adults),
            ageRatingConfirmed: true,
          })
          .expect(200)
      ).body,
    ).booking;
    expect(confirmed.ageRatingConfirmed).toBe(true);

    const family = bookingResponseSchema.parse(
      (await hold(client, { showtimeId: fx.showtime.id, seatIds: seatIds(1) }).expect(201)).body,
    ).booking;
    expect(family.ageConfirmationRequired).toBe(false);
    const stored = bookingResponseSchema.parse(
      (
        await client
          .put(`/api/bookings/${family.id}/tickets`, {
            tickets: allTickets(family),
            ageRatingConfirmed: true,
          })
          .expect(200)
      ).body,
    ).booking;
    expect(stored.ageRatingConfirmed).toBe(false);
  });
});

describe('DELETE /api/bookings/:id/hold and the cleanup job', () => {
  it('releases a hold at once', async () => {
    const client = await customer();
    const { booking } = bookingResponseSchema.parse(
      (await hold(client, { showtimeId: fx.showtime.id, seatIds: seatIds(2) }).expect(201)).body,
    );
    await client.delete(`/api/bookings/${booking.id}/hold`).expect(204);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.status).toBe('CANCELLED');
    expect(row.cancelledAt).not.toBeNull();
    expect(await prisma.seatReservation.count()).toBe(0);
    await client.delete(`/api/bookings/${booking.id}/hold`).expect(409);
  });

  it('expires stale holds in batches, idempotently, and frees their seats', async () => {
    for (const seatId of seatIds(3)) {
      await holdSeats(prisma, {
        userId: fx.user.id,
        showtimeId: fx.showtime.id,
        hallId: fx.hall.id,
        seatIds: [seatId],
        holdMinutes: -2,
      });
    }
    const live = await holdSeats(prisma, {
      userId: fx.user.id,
      showtimeId: fx.otherShowtime.id,
      hallId: fx.hall.id,
      seatIds: seatIds(1),
    });
    expect(await expireAllStaleHolds(prisma, new Date())).toBe(3);
    expect(await expireAllStaleHolds(prisma, new Date())).toBe(0);
    expect(await prisma.booking.count({ where: { status: 'EXPIRED' } })).toBe(3);
    expect(await prisma.seatReservation.findMany({ select: { bookingId: true } })).toEqual([
      { bookingId: live.id },
    ]);
  });
});
