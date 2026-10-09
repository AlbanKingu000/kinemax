// Helpers for integration tests against kinemax_test (never the development database).
import { expect } from 'vitest';
import { generateBookingCode } from '../../src/domain/booking-code.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';

/**
 * SQLSTATE of a database error raised through Prisma's pg driver adapter. Statement errors are
 * PrismaClientKnownRequestErrors (code in meta.driverAdapterError.cause); errors raised at COMMIT
 * of an interactive transaction (deferred constraints) are DriverAdapterErrors (code in cause).
 */
export function sqlStateOf(error: unknown): string | undefined {
  type Cause = { originalCode?: unknown } | undefined;
  const e = error as { meta?: { driverAdapterError?: { cause?: Cause } }; cause?: Cause };
  const code = e.meta?.driverAdapterError?.cause?.originalCode ?? e.cause?.originalCode;
  return typeof code === 'string' ? code : undefined;
}

export const SQLSTATE = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  checkViolation: '23514',
  exclusionViolation: '23P01',
} as const;

/** Asserts that a database operation fails with the given SQLSTATE (and message part, if given). */
export async function expectDbError(
  operation: Promise<unknown>,
  sqlState: string,
  messagePart?: string,
): Promise<void> {
  let caught: unknown;
  try {
    await operation;
  } catch (error) {
    caught = error;
  }
  expect(caught, 'expected the database to reject the operation').toBeDefined();
  expect(sqlStateOf(caught)).toBe(sqlState);
  if (messagePart) expect((caught as Error).message).toContain(messagePart);
}

/**
 * Empties every domain table and restores the singleton AppSettings row with the database defaults
 * (TRUNCATE "User" also empties AppSettings, which references the user who last edited it).
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw`TRUNCATE "DemoPayment", "BookingFoodItem", "SeatReservation",
    "WholeHallReservation", "BookingSeat", "Booking", "Session", "ManagerLocation", "AuditLog",
    "Showtime", "Seat", "HallTypePrice", "WholeHallPrice", "TimePriceAdjustment",
    "TicketCategoryDiscount", "TicketCategory", "SeatTypeSurcharge", "LocationMenuItem",
    "ComboComponent", "MenuItem", "Hall", "HallType", "Location", "Movie", "AppSettings",
    "User"`;
  await prisma.appSettings.create({ data: { id: 1 } });
}

const HOUR = 3_600_000;

/** Small fixture: one location with a standard hall (4 seats) and a suite (2 seats). */
export async function createFixture(prisma: PrismaClient) {
  const location = await prisma.location.create({
    data: {
      slug: 'test-city',
      name: 'Kinemax Test',
      city: 'Test',
      address: 'Rruga e Testit 1',
      timeZone: 'Europe/Belgrade',
    },
  });
  const standardType = await prisma.hallType.create({
    data: { code: 'STANDARD', nameSq: 'Standard', descriptionSq: 'Sallë standarde' },
  });
  const suiteType = await prisma.hallType.create({
    data: {
      code: 'PRIVATE_SUITE',
      nameSq: 'Suitë',
      descriptionSq: 'Suitë private',
      allowsSeatDelivery: true,
    },
  });
  const geometry = { screenWidthM: 10, screenHeightM: 4, screenZ: 3 };
  const hall = await prisma.hall.create({
    data: { locationId: location.id, hallTypeId: standardType.id, name: 'Salla 1', ...geometry },
  });
  const otherHall = await prisma.hall.create({
    data: { locationId: location.id, hallTypeId: standardType.id, name: 'Salla 2', ...geometry },
  });
  const suite = await prisma.hall.create({
    data: {
      locationId: location.id,
      hallTypeId: suiteType.id,
      name: 'Suita',
      wholeHallOnly: true,
      ...geometry,
    },
  });
  const seat = (hallId: string, rowLabel: string, number: number) => ({
    hallId,
    rowLabel,
    number,
    seatType: 'STANDARD' as const,
    x: number,
    y: 5,
    z: 0,
  });
  await prisma.seat.createMany({
    data: [
      ...[1, 2, 3, 4].map((n) => seat(hall.id, 'A', n)),
      { ...seat(hall.id, 'B', 1), seatType: 'COUPLE' as const, widthUnits: 2 },
      seat(otherHall.id, 'A', 1),
      ...[1, 2].map((n) => ({ ...seat(suite.id, 'A', n), seatType: 'VIP' as const })),
    ],
  });
  const seats = await prisma.seat.findMany({ orderBy: [{ hallId: 'asc' }, { number: 'asc' }] });
  const movie = await prisma.movie.create({
    data: {
      slug: 'test-movie',
      titleSq: 'Filmi i Testit',
      synopsisSq: 'Një film për teste.',
      durationMinutes: 100,
      ageRating: 'AGE_12',
      genres: ['DRAMA'],
      releaseDate: new Date('2026-01-01'),
      director: 'Regjisor Testi',
      status: 'NOW_SHOWING',
    },
  });
  const startsAt = new Date(Date.now() + 24 * HOUR);
  const endsAt = new Date(startsAt.getTime() + 2 * HOUR);
  const showtime = await prisma.showtime.create({
    data: { movieId: movie.id, hallId: hall.id, startsAt, endsAt, languageVersion: 'DUBBED_SQ' },
  });
  const otherShowtime = await prisma.showtime.create({
    data: {
      movieId: movie.id,
      hallId: hall.id,
      startsAt: endsAt,
      endsAt: new Date(endsAt.getTime() + 2 * HOUR),
      languageVersion: 'DUBBED_SQ',
    },
  });
  const suiteShowtime = await prisma.showtime.create({
    data: { movieId: movie.id, hallId: suite.id, startsAt, endsAt, languageVersion: 'DUBBED_SQ' },
  });
  const user = await prisma.user.create({
    data: { email: 'test@kinemax.test', passwordHash: 'not-a-real-hash', name: 'Test User' },
  });
  const adult = await prisma.ticketCategory.create({ data: { code: 'ADULT', nameSq: 'I rritur' } });
  const student = await prisma.ticketCategory.create({
    data: { code: 'STUDENT', nameSq: 'Student' },
  });
  const couple = seats.find((s) => s.hallId === hall.id && s.seatType === 'COUPLE');
  if (!couple) throw new Error('fixture couple sofa missing');

  return {
    location,
    hall,
    otherHall,
    suite,
    couple,
    student,
    seats: {
      /** Row A of Salla 1: four standard seats. */
      hall: seats.filter((s) => s.hallId === hall.id && s.rowLabel === 'A'),
      otherHall: seats.filter((s) => s.hallId === otherHall.id),
      suite: seats.filter((s) => s.hallId === suite.id),
    },
    movie,
    showtime,
    otherShowtime,
    suiteShowtime,
    user,
    adult,
  };
}

export type Fixture = Awaited<ReturnType<typeof createFixture>>;

/** Creates a HELD booking and locks the given seats, like the future hold endpoint will. */
export function holdSeats(
  prisma: PrismaClient,
  options: {
    userId: string;
    showtimeId: string;
    hallId: string;
    seatIds: string[];
    holdMinutes?: number;
  },
) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        code: generateBookingCode(),
        userId: options.userId,
        showtimeId: options.showtimeId,
        holdExpiresAt: new Date(Date.now() + (options.holdMinutes ?? 10) * 60_000),
        totalCents: 0,
      },
    });
    await tx.seatReservation.createMany({
      data: options.seatIds.map((seatId) => ({
        showtimeId: options.showtimeId,
        hallId: options.hallId,
        seatId,
        bookingId: booking.id,
      })),
    });
    return booking;
  });
}

/** Creates a HELD whole-hall booking and locks the whole hall for the showtime. */
export function holdWholeHall(
  prisma: PrismaClient,
  options: { userId: string; showtimeId: string; hallId: string },
) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        code: generateBookingCode(),
        userId: options.userId,
        showtimeId: options.showtimeId,
        holdExpiresAt: new Date(Date.now() + 10 * 60_000),
        totalCents: 14_000,
        isWholeHall: true,
        wholeHallPriceCents: 14_000,
      },
    });
    await tx.wholeHallReservation.create({
      data: { showtimeId: options.showtimeId, hallId: options.hallId, bookingId: booking.id },
    });
    return booking;
  });
}

/** A ticket row for BookingSeat (occupant 1 by default) with a dummy price snapshot. */
export function ticket(
  bookingId: string,
  seatId: string,
  ticketCategory: { id: string; code: string },
  occupant = 1,
  seatSurchargeCents = 0,
) {
  return {
    bookingId,
    seatId,
    occupant,
    ticketCategoryId: ticketCategory.id,
    ticketCategoryCode: ticketCategory.code,
    unitPriceCents: 450,
    seatSurchargeCents,
    priceBreakdown: { totalCents: 450 },
  };
}
