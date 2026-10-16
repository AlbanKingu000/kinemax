import { randomUUID } from 'node:crypto';
import { statsResponseSchema } from '@kinemax/shared';
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
import { makeTestApp, testPrisma } from '../support/app.js';

// The dashboard numbers, on a pinned clock: 10 March 2030, 13:00 in Kosovo (12:00 UTC).

const prisma = testPrisma();
const NOW = new Date('2030-03-10T12:00:00Z');
const { app } = makeTestApp({ ...GENEROUS_LIMITS, now: () => NOW });
let fx: AdminFixture;
let clients: Record<Role, Client>;
const at = (iso: string) => new Date(iso);

async function show(hallId: string, startsAt: string) {
  const start = at(startsAt);
  return prisma.showtime.create({
    data: {
      movieId: fx.movie.id,
      hallId,
      startsAt: start,
      endsAt: new Date(start.getTime() + 2 * 3_600_000),
      languageVersion: 'DUBBED_SQ',
    },
  });
}

/** A paid booking (CONFIRMED + a SUCCEEDED payment at `paidAt`), optionally refunded later. */
async function paid(options: {
  showtimeId: string;
  hallId: string;
  seatIds?: string[];
  wholeHall?: boolean;
  amountCents: number;
  paidAt: string;
  refundedAt?: string;
  seatFood?: number;
}) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        code: generateBookingCode(),
        userId: fx.user.id,
        showtimeId: options.showtimeId,
        holdExpiresAt: new Date(Date.now() + 10 * 60_000),
        totalCents: options.amountCents,
        ...(options.wholeHall
          ? { isWholeHall: true, wholeHallPriceCents: options.amountCents }
          : {}),
      },
    });
    if (options.wholeHall) {
      await tx.wholeHallReservation.create({
        data: { showtimeId: options.showtimeId, hallId: options.hallId, bookingId: booking.id },
      });
    }
    for (const seatId of options.seatIds ?? []) {
      await tx.seatReservation.create({
        data: {
          showtimeId: options.showtimeId,
          hallId: options.hallId,
          seatId,
          bookingId: booking.id,
        },
      });
      await tx.bookingSeat.create({ data: ticket(booking.id, seatId, fx.adult) });
    }
    if (options.seatFood) {
      const item = await tx.menuItem.upsert({
        where: { slug: 'popcorn' },
        update: {},
        create: { slug: 'popcorn', nameSq: 'Kokoshka', category: 'POPCORN' },
      });
      await tx.bookingFoodItem.create({
        data: {
          bookingId: booking.id,
          menuItemId: item.id,
          nameSq: 'Kokoshka',
          quantity: 2,
          unitPriceCents: options.seatFood / 2,
          fulfillment: 'DELIVER_TO_SEAT',
          serveTiming: 'BEFORE_SHOW',
        },
      });
    }
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: 'CONFIRMED', confirmedAt: at(options.paidAt) },
    });
    const payment = await tx.demoPayment.create({
      data: {
        bookingId: booking.id,
        amountCents: options.amountCents,
        status: 'SUCCEEDED',
        reference: randomUUID(),
        succeededAt: at(options.paidAt),
      },
    });
    if (options.refundedAt) {
      await tx.demoPayment.update({
        where: { id: payment.id },
        data: { status: 'REFUNDED', refundedAt: at(options.refundedAt) },
      });
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'REFUNDED', cancelledAt: at(options.refundedAt) },
      });
    }
    return booking;
  });
}

let todayShow: { id: string };
let suiteShow: { id: string };

beforeEach(async () => {
  await resetDatabase(prisma);
  fx = await createAdminFixture(prisma);
  clients = await staffClients(app, fx);
  const [a1, a2, a3] = fx.seats.hall;
  todayShow = await show(fx.hall.id, '2030-03-10T16:00:00Z');
  suiteShow = await show(fx.suite.id, '2030-03-10T18:00:00Z');
  const otherShow = await show(fx.other.hall.id, '2030-03-10T16:00:00Z');
  // Two tickets + 3,00 € food to the seat, paid today.
  await paid({
    showtimeId: todayShow.id,
    hallId: fx.hall.id,
    seatIds: [a1?.id ?? '', a2?.id ?? ''],
    amountCents: 900,
    paidAt: '2030-03-10T09:00:00Z',
    seatFood: 300,
  });
  // Paid five days ago, refunded today.
  await paid({
    showtimeId: todayShow.id,
    hallId: fx.hall.id,
    seatIds: [a3?.id ?? ''],
    amountCents: 450,
    paidAt: '2030-03-05T10:00:00Z',
    refundedAt: '2030-03-10T10:00:00Z',
  });
  // The whole suite (2 seats), paid today.
  await paid({
    showtimeId: suiteShow.id,
    hallId: fx.suite.id,
    wholeHall: true,
    amountCents: 14_000,
    paidAt: '2030-03-10T11:00:00Z',
  });
  // Another cinema: never in the first cinema's numbers.
  const otherSeat = await prisma.seat.findFirstOrThrow({ where: { hallId: fx.other.hall.id } });
  await paid({
    showtimeId: otherShow.id,
    hallId: fx.other.hall.id,
    seatIds: [otherSeat.id],
    amountCents: 500,
    paidAt: '2030-03-10T08:00:00Z',
  });
});

const stats = async (client: Client, query: string) => {
  const res = await client.get(`/api/admin/stats${query}`).expect(200);
  return statsResponseSchema.parse(res.body);
};

describe('GET /api/admin/stats', () => {
  it('computes today in the cinema: net revenue, tickets, occupancy, hall types, deliveries', async () => {
    const body = await stats(clients.superAdmin, `?location=${fx.location.id}&range=today`);
    expect(body).toMatchObject({ range: 'today', timeZone: 'Europe/Belgrade', from: '2030-03-10' });
    // Tickets 600 + suite 14 000 − refund 450; food 300.
    expect(body.revenue).toEqual({
      ticketsCents: 14_150,
      foodCents: 300,
      totalCents: 14_450,
      refundsCents: 450,
    });
    expect(body.ticketsSold).toBe(3);
    // Salla 1 (5 seats, 2 booked) and the suite (2 seats, booked whole).
    expect(body.occupancy).toEqual({ soldSeats: 4, capacity: 7 });
    expect(body.daily).toEqual([
      { date: '2030-03-10', ticketsCents: 14_150, foodCents: 300, totalCents: 14_450 },
    ]);
    expect(body.hallTypes).toEqual([
      expect.objectContaining({ code: 'STANDARD', ticketsSold: 1, revenueCents: 150 }),
      expect.objectContaining({ code: 'PRIVATE_SUITE', ticketsSold: 2, revenueCents: 14_000 }),
    ]);
    expect(body.topMovies).toEqual([
      expect.objectContaining({ titleSq: 'Filmi i Testit', ticketsSold: 3, revenueCents: 14_150 }),
    ]);
    expect(body.upcoming.map((u) => [u.showtimeId, u.soldSeats, u.capacity])).toEqual([
      [todayShow.id, 2, 5],
      [suiteShow.id, 2, 2],
    ]);
    expect(body.seatDeliveryOrdersToday).toBe(1);
  });

  it('adds the earlier days for 7 days, one entry per day', async () => {
    const body = await stats(clients.superAdmin, `?location=${fx.location.id}&range=7d`);
    expect(body.from).toBe('2030-03-04');
    expect(body.daily).toHaveLength(7);
    expect(body.daily.find((d) => d.date === '2030-03-05')?.ticketsCents).toBe(450);
    expect(body.revenue.ticketsCents).toBe(14_600);
    expect(body.ticketsSold).toBe(4);
    const month = await stats(clients.superAdmin, `?location=${fx.location.id}&range=30d`);
    expect(month.daily).toHaveLength(30);
    expect(month.revenue.totalCents).toBe(14_900);
  });

  it('sums every cinema for a super admin without a filter', async () => {
    const body = await stats(clients.superAdmin, '');
    expect(body.revenue.totalCents).toBe(14_950);
    expect(body.upcoming).toHaveLength(3);
  });

  it('keeps a manager to their own cinema', async () => {
    const own = await stats(clients.manager, '');
    expect(own.revenue.totalCents).toBe(14_450);
    const other = await stats(clients.otherManager, '');
    expect(other.revenue.totalCents).toBe(500);
    expect(other.upcoming.map((u) => u.locationName)).toEqual(['Kinemax Tjetër']);
  });

  it('refuses other cinemas (IDOR), customers and visitors', async () => {
    await expectRefused(clients, ['anonymous', 'customer', 'otherManager'], (c) =>
      c.get(`/api/admin/stats?location=${fx.location.id}`),
    );
    await expectRefused(clients, ['manager'], (c) =>
      c.get(`/api/admin/stats?location=${fx.other.location.id}`),
    );
  });

  it('validates the query', async () => {
    for (const query of ['?range=year', '?location=nope', '?range=today&extra=1']) {
      const res = await clients.superAdmin.get(`/api/admin/stats${query}`);
      expect(res.status).toBe(400);
    }
  });
});
