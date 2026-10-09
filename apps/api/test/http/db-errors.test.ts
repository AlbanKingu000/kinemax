import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DOMAIN_SQLSTATE } from '../../src/db/domain-error-codes.js';
import { databaseErrorInfo, mapDatabaseError, sqlStateOf } from '../../src/http/db-errors.js';
import { createErrorHandler } from '../../src/http/errors.js';
import { testLogger } from '../support/app.js';

/** A statement error as Prisma reports it (PrismaClientKnownRequestError). */
function statementError(sqlState: string, message: string, constraint?: string) {
  return Object.assign(new Error('Database error'), {
    name: 'PrismaClientKnownRequestError',
    code: 'P2039',
    meta: {
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: sqlState,
          originalMessage: message,
          ...(constraint ? { constraint: { index: constraint } } : {}),
          detail: 'Failing row contains (secret-value, $argon2id$...)',
        },
      },
    },
  });
}

/** An error at COMMIT of an interactive transaction (raw DriverAdapterError). */
function commitError(sqlState: string, message: string, constraint?: string) {
  return Object.assign(new Error(message), {
    name: 'DriverAdapterError',
    cause: {
      originalCode: sqlState,
      originalMessage: message,
      ...(constraint ? { constraint: { index: constraint } } : {}),
      kind: 'postgres',
      detail: 'Failing row contains (secret-value)',
    },
  });
}

const CASES: { name: string; sqlState: string; status: number; code: string }[] = [
  { name: 'unique violation', sqlState: '23505', status: 409, code: 'conflict' },
  { name: 'exclusion violation', sqlState: '23P01', status: 409, code: 'conflict' },
  { name: 'RESTRICT violation', sqlState: '23001', status: 409, code: 'conflict' },
  { name: 'CHECK constraint', sqlState: '23514', status: 422, code: 'unprocessable' },
  { name: 'foreign key (insert/update)', sqlState: '23503', status: 422, code: 'unprocessable' },
  {
    name: 'KX001 booking transition',
    sqlState: DOMAIN_SQLSTATE.bookingTransition,
    status: 409,
    code: 'conflict',
  },
  {
    name: 'KX002 hold expired',
    sqlState: DOMAIN_SQLSTATE.holdExpired,
    status: 409,
    code: 'conflict',
  },
  {
    name: 'KX003 lock needs an active booking',
    sqlState: DOMAIN_SQLSTATE.reservationNeedsActiveBooking,
    status: 409,
    code: 'conflict',
  },
  {
    name: 'KX004 hall booking mode',
    sqlState: DOMAIN_SQLSTATE.hallBookingMode,
    status: 422,
    code: 'unprocessable',
  },
  {
    name: 'KX005 seat ticket count',
    sqlState: DOMAIN_SQLSTATE.seatTicketCount,
    status: 422,
    code: 'unprocessable',
  },
  {
    name: 'KX006 seat type change',
    sqlState: DOMAIN_SQLSTATE.seatTypeChange,
    status: 409,
    code: 'conflict',
  },
  { name: 'unknown SQLSTATE', sqlState: '22012', status: 500, code: 'internal_error' },
];

// The same error as an English, German or Albanian server would word it (lc_messages), plus no
// text at all. The mapping must give the same result for every one of them.
const MESSAGES = [
  'new row for relation "X" violates check constraint "X_check"',
  'neue Zeile für Relation »X« verletzt Check-Constraint »X_check«',
  'rreshti i ri për relacionin "X" shkel kufizimin "X_check"',
  '',
];

describe('database error mapping (by SQLSTATE only)', () => {
  for (const shape of [
    { label: 'statement error', make: statementError },
    { label: 'commit-time DriverAdapterError', make: commitError },
  ]) {
    describe(shape.label, () => {
      for (const c of CASES) {
        it(`${c.name} (${c.sqlState}) -> ${String(c.status)} in every language`, async () => {
          for (const message of MESSAGES) {
            const error = shape.make(c.sqlState, message);
            expect(sqlStateOf(error)).toBe(c.sqlState);
            expect(databaseErrorInfo(error)).toEqual({ sqlState: c.sqlState, message });
            expect(mapDatabaseError(c.sqlState)).toMatchObject({ status: c.status, code: c.code });

            // Through the central error handler: generic body, details only in the log.
            const logger = testLogger();
            const app = express();
            app.get('/boom', () => {
              throw error;
            });
            app.use(createErrorHandler(logger));
            const res = await request(app).get('/boom').expect(c.status);
            expect(res.body).toEqual({
              error: { code: c.code, message: expect.any(String) as unknown },
            });
            for (const leak of ['secret-value', 'argon2', 'Failing row', 'X_check']) {
              expect(res.text).not.toContain(leak);
            }
            const log = c.status >= 500 ? logger.error : logger.warn;
            expect(log).toHaveBeenCalledWith(
              'Database error',
              expect.objectContaining({ sqlState: c.sqlState, status: c.status }),
            );
            expect(JSON.stringify(log.mock.calls)).not.toContain('secret-value');
          }
        });
      }
    });
  }

  it('ignores misleading message text: the code decides', () => {
    const status = (error: Error) => mapDatabaseError(sqlStateOf(error) ?? '').status;
    // A trigger error whose text sounds like a CHECK constraint, and the other way round.
    expect(status(statementError('KX002', 'violates check constraint'))).toBe(409);
    expect(status(statementError('23514', 'cannot confirm a booking whose hold has expired'))).toBe(
      422,
    );
    expect(status(statementError('23503', 'update or delete on table "X"'))).toBe(422);
  });

  it('keeps the constraint name when the adapter provides it (for logs)', async () => {
    expect(databaseErrorInfo(statementError('23505', 'whatever', 'User_email_key'))).toEqual({
      sqlState: '23505',
      constraint: 'User_email_key',
      message: 'whatever',
    });
    const logger = testLogger();
    const app = express();
    app.get('/boom', () => {
      throw commitError('23001', 'x', 'Hall_locationId_fkey');
    });
    app.use(createErrorHandler(logger));
    await request(app).get('/boom').expect(409);
    expect(logger.warn).toHaveBeenCalledWith(
      'Database error',
      expect.objectContaining({ sqlState: '23001', constraint: 'Hall_locationId_fkey' }),
    );
  });

  it('ignores errors that are not database errors', () => {
    expect(databaseErrorInfo(new Error('x'))).toBeUndefined();
    expect(databaseErrorInfo(null)).toBeUndefined();
    expect(databaseErrorInfo('text')).toBeUndefined();
    expect(databaseErrorInfo({ cause: { originalCode: 42 } })).toBeUndefined();
    expect(databaseErrorInfo({ cause: { originalCode: 'not-a-state' } })).toBeUndefined();
    expect(databaseErrorInfo({ cause: { originalCode: '23505', message: 'm' } })).toEqual({
      sqlState: '23505',
      message: 'm',
    });
    expect(databaseErrorInfo({ cause: { originalCode: '23505' } })).toEqual({
      sqlState: '23505',
      message: '',
    });
  });
});
