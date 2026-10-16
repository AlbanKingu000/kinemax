import { randomUUID } from 'node:crypto';
import {
  adminShowtimeResponseSchema,
  adminShowtimesResponseSchema,
  bulkPreviewResponseSchema,
  deactivateResponseSchema,
} from '@kinemax/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateBookingCode } from '../../src/domain/booking-code.js';
import { addDays, toLocalDateTime, zonedTimeToUtc } from '../../src/domain/time-zone.js';
import { holdSeats, resetDatabase, ticket } from '../db/helpers.js';
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

// Showtime management: local times, server-computed ends, overlaps, bulk, edits, deactivation.

const prisma = testPrisma();
const { app } = makeTestApp(GENEROUS_LIMITS);
const TZ = 'Europe/Belgrade';
let fx: AdminFixture;
let clients: Record<Role, Client>;
/** A local date a few days ahead, free of fixture shows. */
let day: string;

beforeEach(async () => {
  await resetDatabase(prisma);
  fx = await createAdminFixture(prisma);
  clients = await staffClients(app, fx);
  day = addDays(toLocalDateTime(new Date(), TZ).date, 4);
});

const at = (date: string, time: string) => {
  const [h, m] = time.split(':').map(Number);
  return zonedTimeToUtc(date, (h ?? 0) * 60 + (m ?? 0), TZ);
};
const input = (extra: object = {}) => ({
  movieId: fx.movie.id,
  hallId: fx.hall.id,
  date: day,
  time: '18:00',
  format: '2D',
  languageVersion: 'DUBBED_SQ',
  ...extra,
});
const create = async (extra: object = {}) =>
  adminShowtimeResponseSchema.parse(
    (await clients.manager.post('/api/admin/showtimes', input(extra)).expect(201)).body,
  ).showtime;

/** A paid booking for one seat of the show (CONFIRMED + SUCCEEDED payment of 450). */
async function paidBooking(showtimeId: string, seatId: string) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        code: generateBookingCode(),
        userId: fx.user.id,
        showtimeId,
        holdExpiresAt: new Date(Date.now() + 600_000),
        totalCents: 450,
      },
    });
    await tx.seatReservation.create({
      data: { showtimeId, hallId: fx.hall.id, seatId, bookingId: booking.id },
    });
    await tx.bookingSeat.create({ data: ticket(booking.id, seatId, fx.adult) });
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
    await tx.demoPayment.create({
      data: {
        bookingId: booking.id,
        amountCents: 450,
        status: 'SUCCEEDED',
        reference: randomUUID(),
        succeededAt: new Date(),
      },
    });
    return booking;
  });
}

describe('the day list', () => {
  it('lists a day of the cinema with halls, schedulable movies and show numbers', async () => {
    const show = await create();
    await paidBooking(show.id, fx.seats.hall[0]?.id ?? '');
    const res = await clients.manager
      .get(`/api/admin/showtimes?location=${fx.location.id}&date=${day}`)
      .expect(200);
    const body = adminShowtimesResponseSchema.parse(res.body);
    expect(body.cleaningBufferMinutes).toBe(20);
    expect(body.halls.map((h) => h.name)).toEqual(['Salla 1', 'Salla 2', 'Suita']);
    expect(body.movies.map((m) => m.id)).toEqual([fx.movie.id]);
    expect(body.showtimes).toEqual([
      expect.objectContaining({
        id: show.id,
        soldTickets: 1,
        activeBookings: 1,
        paidBookings: 1,
        refundCents: 450,
        isPast: false,
      }),
    ]);
  });

  it('keeps managers to their cinemas and closes it to customers', async () => {
    await expectRefused(clients, ['anonymous', 'customer', 'otherManager'], (c) =>
      c.get(`/api/admin/showtimes?location=${fx.location.id}&date=${day}`),
    );
    await clients.superAdmin
      .get(`/api/admin/showtimes?location=${fx.other.location.id}&date=${day}`)
      .expect(200);
    await clients.manager.get(`/api/admin/showtimes?date=${day}`).expect(400);
  });
});

describe('creating shows', () => {
  it('turns the local time into the instant and computes the end on the server', async () => {
    const show = await create({ time: '18:00', format: '3D' });
    // 100 minutes + 20 minutes cleaning.
    expect(show.startsAt).toBe(at(day, '18:00').toISOString());
    expect(show.endsAt).toBe(at(day, '20:00').toISOString());
    expect(show.format).toBe('3D');
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: show.id } });
    expect(log).toMatchObject({ action: 'showtime.create', actorId: fx.staff.manager.id });
  });

  it('answers an overlap with 409 from the database rule, and refuses past or archived input', async () => {
    await create({ time: '18:00' });
    const overlap = await clients.manager.post('/api/admin/showtimes', input({ time: '19:30' }));
    expect(overlap.status).toBe(409);
    expect(overlap.body).toMatchObject({ error: { code: 'conflict' } });
    // Right after the cleaning buffer is free again.
    await create({ time: '20:00' });

    const yesterday = addDays(toLocalDateTime(new Date(), TZ).date, -1);
    await clients.manager.post('/api/admin/showtimes', input({ date: yesterday })).expect(422);
    await prisma.movie.update({ where: { id: fx.movie.id }, data: { status: 'ARCHIVED' } });
    await clients.manager.post('/api/admin/showtimes', input({ time: '22:00' })).expect(422);
    await clients.manager.post('/api/admin/showtimes', input({ time: '25:00' })).expect(400);
  });

  it('never lets a manager create a show in another cinema (IDOR)', async () => {
    const count = () => prisma.showtime.count();
    await expectRefused(
      clients,
      ['manager', 'anonymous', 'customer'],
      (c) => c.post('/api/admin/showtimes', input({ hallId: fx.other.hall.id })),
      count,
    );
  });
});

describe('bulk create', () => {
  const bulk = (slots: { date: string; time: string }[]) => ({
    movieId: fx.movie.id,
    hallId: fx.hall.id,
    format: '2D',
    languageVersion: 'DUBBED_SQ',
    slots,
  });

  it('previews conflicts, duplicates and past slots before saving', async () => {
    await create({ time: '18:00' });
    const yesterday = addDays(toLocalDateTime(new Date(), TZ).date, -1);
    const res = await clients.manager
      .post(
        '/api/admin/showtimes/bulk/preview',
        bulk([
          { date: day, time: '14:00' },
          { date: day, time: '19:00' },
          { date: day, time: '15:00' },
          { date: yesterday, time: '14:00' },
          { date: addDays(day, 1), time: '14:00' },
        ]),
      )
      .expect(200);
    const { slots } = bulkPreviewResponseSchema.parse(res.body);
    expect(slots.map((s) => s.status)).toEqual(['ok', 'conflict', 'duplicate', 'past', 'ok']);
    expect(slots[1]?.conflicts).toEqual([
      expect.objectContaining({ movieTitleSq: 'Filmi i Testit' }),
    ]);
    expect(await prisma.showtime.count({ where: { startsAt: { gte: at(day, '00:00') } } })).toBe(1);
  });

  it('creates every slot in one go, or none when one cannot be created', async () => {
    await create({ time: '18:00' });
    const before = await prisma.showtime.count();
    const refused = await clients.manager.post(
      '/api/admin/showtimes/bulk',
      bulk([
        { date: addDays(day, 1), time: '14:00' },
        { date: day, time: '19:00' },
      ]),
    );
    expect(refused.status).toBe(409);
    expect(await prisma.showtime.count()).toBe(before);

    const days = [1, 2, 3].map((n) => addDays(day, n));
    const res = await clients.manager
      .post(
        '/api/admin/showtimes/bulk',
        bulk(
          days.flatMap((date) => [
            { date, time: '14:00' },
            { date, time: '17:00' },
          ]),
        ),
      )
      .expect(201);
    expect(res.body).toEqual({ created: 6 });
    expect(await prisma.showtime.count()).toBe(before + 6);
    expect(await prisma.auditLog.count({ where: { action: 'showtime.bulk_create' } })).toBe(1);
  });

  it('keeps bulk inside the manager’s cinemas', async () => {
    await expectRefused(
      clients,
      ['manager', 'customer'],
      (c) =>
        c.post('/api/admin/showtimes/bulk', {
          ...bulk([{ date: day, time: '14:00' }]),
          hallId: fx.other.hall.id,
        }),
      () => prisma.showtime.count(),
    );
  });
});

describe('editing shows', () => {
  it('moves a show without tickets and recomputes its end', async () => {
    const show = await create({ time: '18:00' });
    const res = await clients.manager
      .patch(`/api/admin/showtimes/${show.id}`, { time: '21:15', hallId: fx.otherHall.id })
      .expect(200);
    expect(adminShowtimeResponseSchema.parse(res.body).showtime).toMatchObject({
      hallId: fx.otherHall.id,
      startsAt: at(day, '21:15').toISOString(),
      endsAt: at(day, '23:15').toISOString(),
    });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'showtime.update' } });
    expect(log.before).toMatchObject({ hallId: fx.hall.id });
  });

  it('locks every field once a ticket is sold (deactivate and create a new show instead)', async () => {
    const show = await create({ time: '18:00' });
    await paidBooking(show.id, fx.seats.hall[0]?.id ?? '');
    for (const change of [
      { time: '19:00' },
      { hallId: fx.otherHall.id },
      { format: '3D' },
      { languageVersion: 'ORIGINAL_SQ_SUBTITLES' },
    ]) {
      const res = await clients.manager.patch(`/api/admin/showtimes/${show.id}`, change);
      expect(res.status, JSON.stringify(change)).toBe(409);
      expect(res.body).toMatchObject({ error: { fields: [{ code: 'tickets_sold' }] } });
    }
    const row = await prisma.showtime.findUniqueOrThrow({ where: { id: show.id } });
    expect([row.format, row.languageVersion, row.hallId]).toEqual([
      'FORMAT_2D',
      'DUBBED_SQ',
      fx.hall.id,
    ]);
  });

  it('keeps started shows read-only', async () => {
    const started = await prisma.showtime.create({
      data: {
        movieId: fx.movie.id,
        hallId: fx.otherHall.id,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 3_600_000),
        languageVersion: 'DUBBED_SQ',
      },
    });
    for (const send of [
      () => clients.manager.patch(`/api/admin/showtimes/${started.id}`, { format: '3D' }),
      () => clients.manager.post(`/api/admin/showtimes/${started.id}/deactivate`),
    ]) {
      expect((await send()).status).toBe(409);
    }
  });

  it('refuses another cinema’s show to a manager (404, nothing changed)', async () => {
    const unchanged = () =>
      prisma.showtime.findUniqueOrThrow({ where: { id: fx.other.showtime.id } });
    await expectRefused(
      clients,
      ['manager', 'customer', 'anonymous'],
      (c) => c.patch(`/api/admin/showtimes/${fx.other.showtime.id}`, { format: '3D' }),
      unchanged,
    );
    await expectRefused(clients, ['manager'], (c) =>
      c.get(`/api/admin/showtimes/${fx.other.showtime.id}`),
    );
  });
});

describe('deactivating a show', () => {
  it('cancels holds and refunds paid bookings in one step, frees the seats and logs it', async () => {
    const [a1, a2] = fx.seats.hall;
    const paid = await paidBooking(fx.showtime.id, a1?.id ?? '');
    const held = await holdSeats(prisma, {
      userId: fx.staff.customer.id,
      showtimeId: fx.showtime.id,
      hallId: fx.hall.id,
      seatIds: [a2?.id ?? ''],
    });
    await prisma.demoPayment.create({
      data: { bookingId: held.id, amountCents: 450, reference: randomUUID() },
    });
    const detail = adminShowtimeResponseSchema.parse(
      (await clients.manager.get(`/api/admin/showtimes/${fx.showtime.id}`).expect(200)).body,
    ).showtime;
    expect(detail).toMatchObject({ activeBookings: 2, paidBookings: 1, refundCents: 450 });

    const res = await clients.manager
      .post(`/api/admin/showtimes/${fx.showtime.id}/deactivate`)
      .expect(200);
    expect(deactivateResponseSchema.parse(res.body)).toMatchObject({
      cancelledBookings: 1,
      refundedBookings: 1,
      refundedCents: 450,
      showtime: { isActive: false, activeBookings: 0 },
    });
    const bookings = await prisma.booking.findMany({
      where: { showtimeId: fx.showtime.id },
      include: { payments: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(bookings.map((b) => [b.id, b.status, b.payments.map((p) => p.status)])).toEqual([
      [paid.id, 'REFUNDED', ['REFUNDED']],
      [held.id, 'CANCELLED', ['FAILED']],
    ]);
    expect(await prisma.seatReservation.count({ where: { showtimeId: fx.showtime.id } })).toBe(0);
    const actions = (
      await prisma.auditLog.findMany({ where: { actorId: fx.staff.manager.id } })
    ).map((row) => row.action);
    expect(actions.sort()).toEqual(['booking.refund', 'showtime.deactivate']);

    // Idempotent: a second call changes nothing.
    const again = await clients.manager
      .post(`/api/admin/showtimes/${fx.showtime.id}/deactivate`)
      .expect(200);
    expect(again.body).toMatchObject({ cancelledBookings: 0, refundedBookings: 0 });
    // Customers cannot hold seats of an inactive show any more.
    await clients.customer
      .post('/api/bookings/hold', { showtimeId: fx.showtime.id, seatIds: [a1?.id] })
      .expect(404);
  });

  it('puts a show back on sale unless the hall is taken by now', async () => {
    await clients.manager.post(`/api/admin/showtimes/${fx.showtime.id}/deactivate`).expect(200);
    await clients.manager.post(`/api/admin/showtimes/${fx.showtime.id}/activate`).expect(200);
    await clients.manager.post(`/api/admin/showtimes/${fx.showtime.id}/deactivate`).expect(200);
    // Another show takes the slot meanwhile.
    await prisma.showtime.create({
      data: {
        movieId: fx.movie.id,
        hallId: fx.hall.id,
        startsAt: fx.showtime.startsAt,
        endsAt: fx.showtime.endsAt,
        languageVersion: 'DUBBED_SQ',
      },
    });
    expect(
      (await clients.manager.post(`/api/admin/showtimes/${fx.showtime.id}/activate`)).status,
    ).toBe(409);
  });

  it('never deactivates another cinema’s show (IDOR) and is closed to customers', async () => {
    const unchanged = () => prisma.booking.findMany({ orderBy: { id: 'asc' } });
    await paidBooking(fx.showtime.id, fx.seats.hall[0]?.id ?? '');
    await expectRefused(
      clients,
      ['otherManager', 'customer', 'anonymous'],
      (c) => c.post(`/api/admin/showtimes/${fx.showtime.id}/deactivate`),
      unchanged,
    );
    expect(
      (await prisma.showtime.findUniqueOrThrow({ where: { id: fx.showtime.id } })).isActive,
    ).toBe(true);
  });
});
