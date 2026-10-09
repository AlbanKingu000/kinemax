import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { databaseErrorInfo, mapDatabaseError, sqlStateOf } from '../../src/http/db-errors.js';
import { createErrorHandler } from '../../src/http/errors.js';
import { testLogger } from '../support/app.js';

/** A statement error as Prisma reports it (PrismaClientKnownRequestError). */
function statementError(sqlState: string, message: string) {
  return Object.assign(new Error('Database error'), {
    name: 'PrismaClientKnownRequestError',
    code: 'P2039',
    meta: {
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: sqlState,
          originalMessage: message,
          detail: 'Failing row contains (secret-value, $argon2id$...)',
        },
      },
    },
  });
}

/** An error at COMMIT of an interactive transaction (raw DriverAdapterError). */
function commitError(sqlState: string, message: string) {
  return Object.assign(new Error(message), {
    name: 'DriverAdapterError',
    cause: {
      originalCode: sqlState,
      originalMessage: message,
      kind: 'postgres',
      detail: 'Failing row contains (secret-value)',
    },
  });
}

const CASES: { name: string; sqlState: string; message: string; status: number; code: string }[] = [
  {
    name: 'unique violation',
    sqlState: '23505',
    message: 'duplicate key value violates unique constraint "User_email_key"',
    status: 409,
    code: 'conflict',
  },
  {
    name: 'exclusion violation',
    sqlState: '23P01',
    message: 'conflicting key value violates exclusion constraint "Showtime_no_overlap_in_hall"',
    status: 409,
    code: 'conflict',
  },
  {
    name: 'CHECK constraint',
    sqlState: '23514',
    message:
      'new row for relation "HallTypePrice" violates check constraint "HallTypePrice_price_nonneg"',
    status: 422,
    code: 'unprocessable',
  },
  {
    name: 'trigger exception',
    sqlState: '23514',
    message: 'cannot confirm a booking whose hold has expired',
    status: 409,
    code: 'conflict',
  },
  {
    name: 'FK on insert',
    sqlState: '23503',
    message:
      'insert or update on table "Session" violates foreign key constraint "Session_userId_fkey"',
    status: 422,
    code: 'unprocessable',
  },
  {
    name: 'FK on delete',
    sqlState: '23503',
    message:
      'update or delete on table "Location" violates foreign key constraint "Hall_locationId_fkey" on table "Hall"',
    status: 409,
    code: 'conflict',
  },
  {
    name: 'RESTRICT on delete',
    sqlState: '23001',
    message:
      'update or delete on table "Location" violates RESTRICT setting of foreign key constraint "Hall_locationId_fkey" on table "Hall"',
    status: 409,
    code: 'conflict',
  },
  {
    name: 'unknown SQLSTATE',
    sqlState: '22012',
    message: 'division by zero',
    status: 500,
    code: 'internal_error',
  },
];

describe('database error mapping', () => {
  for (const shape of [
    { label: 'statement error', make: statementError },
    { label: 'commit-time DriverAdapterError', make: commitError },
  ]) {
    describe(shape.label, () => {
      for (const c of CASES) {
        it(`${c.name} (${c.sqlState}) -> ${String(c.status)}`, async () => {
          const error = shape.make(c.sqlState, c.message);
          expect(sqlStateOf(error)).toBe(c.sqlState);
          const info = databaseErrorInfo(error);
          expect(info).toEqual({ sqlState: c.sqlState, message: c.message });
          expect(mapDatabaseError(info ?? { sqlState: '', message: '' })).toMatchObject({
            status: c.status,
            code: c.code,
          });

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
          for (const leak of ['secret-value', 'argon2', c.message, 'Failing row']) {
            expect(res.text).not.toContain(leak);
          }
          const log = c.status >= 500 ? logger.error : logger.warn;
          expect(log).toHaveBeenCalledWith(
            'Database error',
            expect.objectContaining({
              sqlState: c.sqlState,
              dbMessage: c.message,
              status: c.status,
            }),
          );
          expect(JSON.stringify(log.mock.calls)).not.toContain('secret-value');
        });
      }
    });
  }

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
