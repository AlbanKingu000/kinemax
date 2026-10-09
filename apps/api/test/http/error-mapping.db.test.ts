// Real PostgreSQL errors (kinemax_test) through the central error handler, in both Prisma shapes.
import { apiErrorResponseSchema } from '@kinemax/shared';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { generateBookingCode } from '../../src/domain/booking-code.js';
import { sqlStateOf } from '../../src/http/db-errors.js';
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

  it('trigger exception (state conflict) -> 409', async () => {
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
      '23514',
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

  it('a deferred trigger failing at COMMIT (raw DriverAdapterError) -> 409', async () => {
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
    expect(sqlStateOf(error)).toBe('23514');
    await expectMapped(commitFailure, 409, 'conflict', '23514');
  });

  it('unknown database errors -> 500', async () => {
    await expectMapped(() => prisma.$queryRaw`SELECT 1 / 0`, 500, 'internal_error', '22012');
  });
});
