// Real PostgreSQL errors (kinemax_test) through the central error handler, in both Prisma shapes.
import { apiErrorResponseSchema } from '@kinemax/shared';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { generateBookingCode } from '../../src/domain/booking-code.js';
import { databaseErrorInfo, sqlStateOf } from '../../src/http/db-errors.js';
import { createErrorHandler } from '../../src/http/errors.js';
import { createFixture, holdSeats, resetDatabase, ticket, type Fixture } from '../db/helpers.js';
import { testLogger, testPrisma } from '../support/app.js';

const prisma = testPrisma();
let f: Fixture;

beforeEach(async () => {
  await resetDatabase(prisma);
  f = await createFixture(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function appRunning(operation: () => Promise<unknown>) {
  const logger = testLogger();
  const app: Express = express();
  app.get('/op', async (_req, res) => {
    await operation();
    res.json({ ok: true });
  });
  app.use(createErrorHandler(logger));
  return { app, logger };
}

async function expectMapped(
  operation: () => Promise<unknown>,
  status: number,
  code: string,
  sqlState: string,
) {
  const { app, logger } = appRunning(operation);
  const res = await request(app).get('/op').expect(status);
  expect(apiErrorResponseSchema.parse(res.body).error.code).toBe(code);
  expect(res.text).not.toMatch(/violates|constraint|trigger|Failing row|\$argon2/);
  const log = status >= 500 ? logger.error : logger.warn;
  expect(log).toHaveBeenCalledWith('Database error', expect.objectContaining({ sqlState }));
}

describe('real database errors through the error handler', () => {
  it('unique violation -> 409', async () => {
    await expectMapped(
      () =>
        prisma.user.create({
          data: { email: 'test@kinemax.test', name: 'x', passwordHash: '$argon2id$x' },
        }),
      409,
      'conflict',
      '23505',
    );
  });

  it('exclusion violation (overlapping showtime) -> 409', async () => {
    await expectMapped(
      () =>
        prisma.showtime.create({
          data: {
            movieId: f.movie.id,
            hallId: f.hall.id,
            startsAt: f.showtime.startsAt,
            endsAt: f.showtime.endsAt,
            languageVersion: 'DUBBED_SQ',
          },
        }),
      409,
      'conflict',
      '23P01',
    );
  });

  it('CHECK constraint -> 422', async () => {
    await expectMapped(
      () =>
        prisma.hallTypePrice.create({
          data: { hallTypeId: f.hall.hallTypeId, priceCents: -5, validFrom: new Date() },
        }),
      422,
      'unprocessable',
      '23514',
    );
  });

  it('KX001 invalid booking transition -> 409', async () => {
    await expectMapped(
      () =>
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
      409,
      'conflict',
      'KX001',
    );
  });

  it('foreign key on insert -> 422, RESTRICT on delete (23001) -> 409', async () => {
    await expectMapped(
      () =>
        prisma.session.create({
          data: {
            userId: '00000000-0000-7000-8000-000000000000',
            tokenHash: 'h',
            expiresAt: new Date(Date.now() + 60_000),
          },
        }),
      422,
      'unprocessable',
      '23503',
    );
    await expectMapped(
      () => prisma.location.delete({ where: { id: f.location.id } }),
      409,
      'conflict',
      '23001',
    );
  });

  it('a unique violation inside an interactive transaction -> 409', async () => {
    await holdSeats(prisma, {
      userId: f.user.id,
      showtimeId: f.showtime.id,
      hallId: f.hall.id,
      seatIds: [f.seats.hall[0]?.id ?? ''],
    });
    await expectMapped(
      () =>
        holdSeats(prisma, {
          userId: f.user.id,
          showtimeId: f.showtime.id,
          hallId: f.hall.id,
          seatIds: [f.seats.hall[0]?.id ?? ''],
        }),
      409,
      'conflict',
      '23505',
    );
  });

  it('a deferred trigger failing at COMMIT (raw DriverAdapterError, KX005) -> 422', async () => {
    const booking = await holdSeats(prisma, {
      userId: f.user.id,
      showtimeId: f.showtime.id,
      hallId: f.hall.id,
      seatIds: [f.couple.id],
    });
    const commitFailure = () =>
      prisma.$transaction(async (tx) => {
        await tx.bookingSeat.create({ data: ticket(booking.id, f.couple.id, f.adult) });
      });
    // Confirm the shape really is the raw adapter error, not a PrismaClientKnownRequestError.
    const error = await commitFailure().catch((e: unknown) => e);
    expect((error as Error).name).toBe('DriverAdapterError');
    expect(sqlStateOf(error)).toBe('KX005');
    await expectMapped(commitFailure, 422, 'unprocessable', 'KX005');
  });

  it('KX002 hold expired and KX003 inactive booking -> 409, KX004 hall booking mode -> 422', async () => {
    const seatId = f.seats.hall[0]?.id ?? '';
    const expired = await holdSeats(prisma, {
      userId: f.user.id,
      showtimeId: f.showtime.id,
      hallId: f.hall.id,
      seatIds: [seatId],
      holdMinutes: -1,
    });
    await expectMapped(
      () =>
        prisma.booking.update({
          where: { id: expired.id },
          data: { status: 'CONFIRMED', confirmedAt: new Date() },
        }),
      409,
      'conflict',
      'KX002',
    );
    await prisma.booking.update({ where: { id: expired.id }, data: { status: 'EXPIRED' } });
    await expectMapped(
      () =>
        prisma.seatReservation.create({
          data: { showtimeId: f.showtime.id, hallId: f.hall.id, seatId, bookingId: expired.id },
        }),
      409,
      'conflict',
      'KX003',
    );
    await expectMapped(
      () =>
        holdSeats(prisma, {
          userId: f.user.id,
          showtimeId: f.suiteShowtime.id,
          hallId: f.suite.id,
          seatIds: [f.seats.suite[0]?.id ?? ''],
        }),
      422,
      'unprocessable',
      'KX004',
    );
  });

  it('KX006 seat type change on a booked sofa -> 409', async () => {
    const booking = await holdSeats(prisma, {
      userId: f.user.id,
      showtimeId: f.showtime.id,
      hallId: f.hall.id,
      seatIds: [f.couple.id],
    });
    await prisma.bookingSeat.createMany({
      data: [
        ticket(booking.id, f.couple.id, f.adult, 1, 200),
        ticket(booking.id, f.couple.id, f.adult, 2),
      ],
    });
    await expectMapped(
      () =>
        prisma.seat.update({
          where: { id: f.couple.id },
          data: { seatType: 'STANDARD', widthUnits: 1 },
        }),
      409,
      'conflict',
      'KX006',
    );
  });

  it('CHECK violations: PostgreSQL names the constraint in a structured field, Prisma drops it', async () => {
    // Inside PostgreSQL the constraint name is a structured diagnostic field, not message text...
    const [row] = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`CREATE FUNCTION pg_temp.kinemax_check_name() RETURNS text
        LANGUAGE plpgsql AS $f$
        DECLARE c text;
        BEGIN
          INSERT INTO "AppSettings" ("id", "updatedAt") VALUES (2, now());
          RETURN NULL;
        EXCEPTION WHEN check_violation THEN
          GET STACKED DIAGNOSTICS c = CONSTRAINT_NAME;
          RETURN c;
        END $f$`;
      return tx.$queryRaw<{ name: string }[]>`SELECT pg_temp.kinemax_check_name() AS name`;
    });
    expect(row?.name).toBe('AppSettings_singleton');
    // ...but Prisma's pg adapter does not pass it on for 23514, so the API maps CHECK violations
    // by SQLSTATE alone. That is safe: our triggers use KX codes, so 23514 only comes from CHECKs.
    const viaPrisma = await prisma.appSettings.create({ data: { id: 2 } }).catch((e: unknown) => e);
    expect(databaseErrorInfo(viaPrisma)).toEqual({
      sqlState: '23514',
      message: expect.any(String) as unknown,
    });
  });

  it('every trigger function raises a KX code, never a standard class', async () => {
    const rows = await prisma.$queryRaw<{ name: string; code: string }[]>`
      SELECT p.proname AS name,
             (regexp_matches(pg_get_functiondef(p.oid), 'ERRCODE = ''([^'']+)''', 'g'))[1] AS code
      FROM pg_proc p WHERE p.proname LIKE 'kinemax%'`;
    expect(rows.length).toBeGreaterThanOrEqual(9);
    for (const { name, code } of rows) expect(code, name).toMatch(/^KX\d{3}$/);
  });

  it('unknown database errors -> 500', async () => {
    await expectMapped(() => prisma.$queryRaw`SELECT 1 / 0`, 500, 'internal_error', '22012');
  });
});
