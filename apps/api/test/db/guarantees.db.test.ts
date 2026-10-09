// Integration tests for the database-level guarantees (see docs/data-model.md, G1-G11).
// They run only against kinemax_test (guarded in test/global-setup.ts).
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { databaseNameFromUrl } from '../../src/db/database-url.js';
import { createPrismaClient } from '../../src/db/prisma.js';
import { generateBookingCode } from '../../src/domain/booking-code.js';
import {
  createFixture,
  expectDbError,
  holdSeats,
  holdWholeHall,
  resetDatabase,
  SQLSTATE,
  sqlStateOf,
  type Fixture,
} from './helpers.js';

const testDatabaseUrl = inject('testDatabaseUrl');
const prisma = createPrismaClient(testDatabaseUrl);
let f: Fixture;

beforeEach(async () => {
  expect(databaseNameFromUrl(testDatabaseUrl)).toMatch(/_test$/);
  await resetDatabase(prisma);
  f = await createFixture(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const seatHold = (seatIds: string[], showtimeId = f.showtime.id) =>
  holdSeats(prisma, { userId: f.user.id, showtimeId, hallId: f.hall.id, seatIds });
const seatId = (index: number) => {
  const seat = f.seats.hall[index];
  if (!seat) throw new Error(`fixture seat ${String(index)} missing`);
  return seat.id;
};

describe('seat locks (G10)', () => {
  it('cannot hold the same seat twice for the same showtime', async () => {
    await seatHold([seatId(0), seatId(1)]);
    await expectDbError(seatHold([seatId(1), seatId(2)]), SQLSTATE.uniqueViolation);
    // The failed hold was rolled back completely: only the first booking exists.
    expect(await prisma.booking.count()).toBe(1);
    expect(await prisma.seatReservation.count()).toBe(2);
  });

  it('allows the same seat in a different showtime', async () => {
    await seatHold([seatId(0)]);
    await expect(seatHold([seatId(0)], f.otherShowtime.id)).resolves.toBeDefined();
  });

  it('rejects a seat that belongs to another hall (composite foreign key)', async () => {
    const foreignSeat = f.seats.otherHall[0]?.id ?? '';
    await expectDbError(seatHold([foreignSeat]), SQLSTATE.foreignKeyViolation);
  });

  it("rejects a lock whose showtime is not the booking's showtime", async () => {
    const booking = await seatHold([seatId(0)]);
    await expectDbError(
      prisma.seatReservation.create({
        data: {
          showtimeId: f.otherShowtime.id,
          hallId: f.hall.id,
          seatId: seatId(1),
          bookingId: booking.id,
        },
      }),
      SQLSTATE.foreignKeyViolation,
    );
  });

  it('only allows locks for active bookings', async () => {
    const booking = await seatHold([seatId(0)]);
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'EXPIRED' } });
    await expectDbError(
      prisma.seatReservation.create({
        data: {
          showtimeId: f.showtime.id,
          hallId: f.hall.id,
          seatId: seatId(1),
          bookingId: booking.id,
        },
      }),
      SQLSTATE.checkViolation,
      'active',
    );
  });
});

describe('releasing seats (G11)', () => {
  it('frees the seats of an expired hold so they can be held again', async () => {
    const booking = await seatHold([seatId(0)]);
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'EXPIRED' } });
    expect(await prisma.seatReservation.count()).toBe(0);
    await expect(seatHold([seatId(0)])).resolves.toBeDefined();
  });

  it('frees the seats of a cancelled booking but keeps its history and price snapshot', async () => {
    const booking = await seatHold([seatId(0)]);
    await prisma.bookingSeat.create({
      data: {
        bookingId: booking.id,
        seatId: seatId(0),
        ticketCategoryId: f.adult.id,
        ticketCategoryCode: 'ADULT',
        unitPriceCents: 450,
        priceBreakdown: { totalCents: 450 },
      },
    });
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    expect(await prisma.seatReservation.count()).toBe(0);
    expect(await prisma.bookingSeat.count({ where: { bookingId: booking.id } })).toBe(1);
    await expect(seatHold([seatId(0)])).resolves.toBeDefined();
  });

  it('keeps the seats locked while a booking stays HELD or CONFIRMED', async () => {
    const booking = await seatHold([seatId(0)]);
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
    expect(await prisma.seatReservation.count()).toBe(1);
    await expectDbError(seatHold([seatId(0)]), SQLSTATE.uniqueViolation);
  });
});

describe('booking status machine (G9)', () => {
  it('requires new bookings to start as HELD', async () => {
    await expectDbError(
      prisma.booking.create({
        data: {
          code: generateBookingCode(),
          userId: f.user.id,
          showtimeId: f.showtime.id,
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          totalCents: 0,
        },
      }),
      SQLSTATE.checkViolation,
      'must start as HELD',
    );
  });

  it('never revives a released booking', async () => {
    const booking = await seatHold([seatId(0)]);
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'EXPIRED' } });
    for (const status of ['HELD', 'CONFIRMED'] as const) {
      await expectDbError(
        prisma.booking.update({
          where: { id: booking.id },
          data: { status, confirmedAt: new Date() },
        }),
        SQLSTATE.checkViolation,
        'cannot change',
      );
    }
  });

  it('refuses to confirm a hold that has already expired', async () => {
    const booking = await holdSeats(prisma, {
      userId: f.user.id,
      showtimeId: f.showtime.id,
      hallId: f.hall.id,
      seatIds: [seatId(0)],
      holdMinutes: -1,
    });
    await expectDbError(
      prisma.booking.update({
        where: { id: booking.id },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      }),
      SQLSTATE.checkViolation,
      'hold has expired',
    );
  });

  it('enforces status timestamps, hold expiry, code format and EUR', async () => {
    const base = { userId: f.user.id, showtimeId: f.showtime.id, totalCents: 0 };
    await expectDbError(
      prisma.booking.create({ data: { ...base, code: generateBookingCode() } }),
      SQLSTATE.checkViolation,
      'Booking_held_has_expiry',
    );
    const holdExpiresAt = new Date(Date.now() + 60_000);
    await expectDbError(
      prisma.booking.create({ data: { ...base, holdExpiresAt, code: 'not-a-code' } }),
      SQLSTATE.checkViolation,
      'Booking_code_format',
    );
    await expectDbError(
      prisma.booking.create({
        data: { ...base, holdExpiresAt, code: generateBookingCode(), currency: 'USD' },
      }),
      SQLSTATE.checkViolation,
      'Booking_currency_eur',
    );
    const booking = await seatHold([seatId(0)]);
    await expectDbError(
      prisma.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED' } }),
      SQLSTATE.checkViolation,
      'Booking_confirmed_has_timestamp',
    );
  });
});

describe('showtimes never overlap in a hall (G2)', () => {
  const show = (hallId: string, startsAt: Date, endsAt: Date, isActive = true) =>
    prisma.showtime.create({
      data: {
        movieId: f.movie.id,
        hallId,
        startsAt,
        endsAt,
        isActive,
        languageVersion: 'DUBBED_SQ',
      },
    });

  it('rejects an overlapping showtime in the same hall', async () => {
    const start = new Date(f.showtime.startsAt.getTime() + 30 * 60_000);
    await expectDbError(
      show(f.hall.id, start, new Date(start.getTime() + 3_600_000)),
      SQLSTATE.exclusionViolation,
      'Showtime_no_overlap_in_hall',
    );
  });

  it('allows back-to-back showtimes and the same time in another hall', async () => {
    // f.otherShowtime already starts exactly when f.showtime ends.
    const end = f.otherShowtime.endsAt;
    await expect(show(f.hall.id, end, new Date(end.getTime() + 3_600_000))).resolves.toBeDefined();
    await expect(
      show(f.otherHall.id, f.showtime.startsAt, f.showtime.endsAt),
    ).resolves.toBeDefined();
  });

  it('ignores deactivated showtimes, so a cancelled slot can be reused', async () => {
    await prisma.showtime.update({ where: { id: f.otherShowtime.id }, data: { isActive: false } });
    await expect(
      show(f.hall.id, f.otherShowtime.startsAt, f.otherShowtime.endsAt),
    ).resolves.toBeDefined();
    await expectDbError(
      prisma.showtime.update({ where: { id: f.otherShowtime.id }, data: { isActive: true } }),
      SQLSTATE.exclusionViolation,
    );
  });

  it('requires endsAt after startsAt', async () => {
    const start = new Date(Date.now() + 10 * 24 * 3_600_000);
    await expectDbError(
      show(f.hall.id, start, start),
      SQLSTATE.checkViolation,
      'Showtime_ends_after_start',
    );
  });
});

describe('private suites (G10)', () => {
  const wholeHall = () =>
    holdWholeHall(prisma, {
      userId: f.user.id,
      showtimeId: f.suiteShowtime.id,
      hallId: f.suite.id,
    });

  it('cannot be booked twice for the same showtime', async () => {
    await wholeHall();
    await expectDbError(wholeHall(), SQLSTATE.uniqueViolation);
  });

  it('cannot be booked seat by seat', async () => {
    await expectDbError(
      holdSeats(prisma, {
        userId: f.user.id,
        showtimeId: f.suiteShowtime.id,
        hallId: f.suite.id,
        seatIds: [f.seats.suite[0]?.id ?? ''],
      }),
      SQLSTATE.checkViolation,
      'only be booked as a whole',
    );
  });

  it('rejects whole-hall locks in normal halls', async () => {
    await expectDbError(
      holdWholeHall(prisma, { userId: f.user.id, showtimeId: f.showtime.id, hallId: f.hall.id }),
      SQLSTATE.checkViolation,
      'whole-hall',
    );
  });

  it('can be booked again after a cancellation', async () => {
    const booking = await wholeHall();
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await expect(wholeHall()).resolves.toBeDefined();
  });
});

describe('unique and check constraints (G3-G8)', () => {
  it('stores emails normalized and unique', async () => {
    await expectDbError(
      prisma.user.create({ data: { email: 'Ana@Kinemax.test', passwordHash: 'x', name: 'Ana' } }),
      SQLSTATE.checkViolation,
      'User_email_normalized',
    );
    await expectDbError(
      prisma.user.create({ data: { email: 'test@kinemax.test', passwordHash: 'x', name: 'Dup' } }),
      SQLSTATE.uniqueViolation,
    );
  });

  it('rejects duplicate seats, slugs, booking codes, menu entries and session hashes', async () => {
    await expectDbError(
      prisma.seat.create({
        data: {
          hallId: f.hall.id,
          rowLabel: 'A',
          number: 1,
          seatType: 'STANDARD',
          x: 0,
          y: 5,
          z: 0,
        },
      }),
      SQLSTATE.uniqueViolation,
    );
    await expectDbError(
      prisma.location.create({
        data: {
          slug: 'test-city',
          name: 'x',
          city: 'x',
          address: 'x',
          timeZone: 'Europe/Belgrade',
        },
      }),
      SQLSTATE.uniqueViolation,
    );
    const booking = await seatHold([seatId(0)]);
    await expectDbError(
      prisma.booking.create({
        data: {
          code: booking.code,
          userId: f.user.id,
          showtimeId: f.showtime.id,
          holdExpiresAt: new Date(Date.now() + 60_000),
          totalCents: 0,
        },
      }),
      SQLSTATE.uniqueViolation,
    );
    const item = await prisma.menuItem.create({
      data: { slug: 'popcorn', nameSq: 'Kokoshka', category: 'POPCORN' },
    });
    await prisma.locationMenuItem.create({
      data: { locationId: f.location.id, menuItemId: item.id, priceCents: 300 },
    });
    await expectDbError(
      prisma.locationMenuItem.create({
        data: { locationId: f.location.id, menuItemId: item.id, priceCents: 350 },
      }),
      SQLSTATE.uniqueViolation,
    );
    const session = {
      userId: f.user.id,
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    };
    await prisma.session.create({ data: session });
    await expectDbError(prisma.session.create({ data: session }), SQLSTATE.uniqueViolation);
  });

  it('rejects negative money, bad price rules, non-demo payments and a second settings row', async () => {
    const validFrom = new Date('2026-01-01T00:00:00Z');
    await expectDbError(
      prisma.hallTypePrice.create({
        data: { hallTypeId: f.hall.hallTypeId, priceCents: -1, validFrom },
      }),
      SQLSTATE.checkViolation,
      'HallTypePrice_price_nonneg',
    );
    await expectDbError(
      prisma.timePriceAdjustment.create({
        data: {
          nameSq: 'x',
          daysOfWeek: [8],
          startMinute: 0,
          endMinute: 60,
          kind: 'PERCENT',
          value: -10,
          validFrom,
        },
      }),
      SQLSTATE.checkViolation,
      'TimePriceAdjustment_days',
    );
    await expectDbError(
      prisma.ticketCategoryDiscount.create({
        data: { ticketCategoryId: f.adult.id, kind: 'PERCENT', value: 120, validFrom },
      }),
      SQLSTATE.checkViolation,
      'TicketCategoryDiscount_value',
    );
    const booking = await seatHold([seatId(0)]);
    await expectDbError(
      prisma.demoPayment.create({
        data: { bookingId: booking.id, amountCents: 100, provider: 'stripe', reference: 'ref-1' },
      }),
      SQLSTATE.checkViolation,
      'DemoPayment_provider_demo',
    );
    await expectDbError(
      prisma.bookingFoodItem.create({
        data: {
          bookingId: booking.id,
          menuItemId: (
            await prisma.menuItem.create({
              data: { slug: 'water', nameSq: 'Ujë', category: 'DRINK' },
            })
          ).id,
          nameSq: 'Ujë',
          quantity: 0,
          unitPriceCents: 100,
        },
      }),
      SQLSTATE.checkViolation,
      'BookingFoodItem_quantity_range',
    );
    await expectDbError(prisma.appSettings.create({ data: { id: 2 } }), SQLSTATE.checkViolation);
    expect(await prisma.appSettings.findUnique({ where: { id: 1 } })).toMatchObject({
      seatHoldMinutes: 10,
      cancellationCutoffMinutes: 120,
    });
  });
});

describe('time zone (G0)', () => {
  it('stores instants exactly in UTC, whatever the server default time zone is', async () => {
    const startsAt = new Date('2026-12-01T12:00:00.000Z');
    const show = await prisma.showtime.create({
      data: {
        movieId: f.movie.id,
        hallId: f.otherHall.id,
        startsAt,
        endsAt: new Date('2026-12-01T14:00:00.000Z'),
        languageVersion: 'DUBBED_SQ',
      },
    });
    const [row] = await prisma.$queryRaw<{ utc: string; tz: string }[]>`
      SELECT to_char("startsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS utc,
             current_setting('TimeZone') AS tz
      FROM "Showtime" WHERE "id" = ${show.id}::uuid`;
    expect(row).toEqual({ utc: '2026-12-01T12:00:00', tz: 'UTC' });
  });
});

describe('concurrency', () => {
  it('lets exactly one of many parallel holds on the same seat succeed', async () => {
    const attempts = 8;
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () => seatHold([seatId(3)])),
    );
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(attempts - 1);
    for (const failure of rejected)
      expect(sqlStateOf(failure.reason)).toBe(SQLSTATE.uniqueViolation);
    expect(await prisma.seatReservation.count()).toBe(1);
    expect(await prisma.booking.count()).toBe(1);
  });
});
