// Maps PostgreSQL errors to HTTP statuses. Prisma (pg driver adapter) delivers them in two shapes:
// - statement errors: PrismaClientKnownRequestError, SQLSTATE in meta.driverAdapterError.cause
// - errors at COMMIT of an interactive transaction (deferred constraints, e.g. G12): a raw
//   DriverAdapterError, SQLSTATE in cause.originalCode
// Both are handled the same way here.

import type { ApiErrorCode } from '@kinemax/shared';

export interface DatabaseErrorInfo {
  sqlState: string;
  /** PostgreSQL's message (constraint / trigger text). Never the "detail" field: it can contain row values. */
  message: string;
}

interface AdapterCause {
  originalCode?: unknown;
  originalMessage?: unknown;
  message?: unknown;
}

function causeOf(error: unknown): AdapterCause | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const e = error as {
    meta?: { driverAdapterError?: { cause?: AdapterCause } };
    cause?: AdapterCause | string | null;
  };
  const fromMeta = e.meta?.driverAdapterError?.cause;
  if (fromMeta) return fromMeta;
  return typeof e.cause === 'object' && e.cause !== null ? e.cause : undefined;
}

/** SQLSTATE and message of a database error in either Prisma shape, or undefined. */
export function databaseErrorInfo(error: unknown): DatabaseErrorInfo | undefined {
  const cause = causeOf(error);
  const sqlState = cause?.originalCode;
  if (typeof sqlState !== 'string' || !/^[0-9A-Z]{5}$/.test(sqlState)) return undefined;
  const message = cause?.originalMessage ?? cause?.message;
  return { sqlState, message: typeof message === 'string' ? message : '' };
}

/** SQLSTATE of a database error in either shape (used by tests and callers that branch on it). */
export function sqlStateOf(error: unknown): string | undefined {
  return databaseErrorInfo(error)?.sqlState;
}

export interface MappedDatabaseError {
  status: 409 | 422 | 500;
  code: ApiErrorCode;
  message: string;
}

const CONFLICT: MappedDatabaseError = {
  status: 409,
  code: 'conflict',
  message: 'The request conflicts with the current state. Please refresh and try again.',
};
const UNPROCESSABLE: MappedDatabaseError = {
  status: 422,
  code: 'unprocessable',
  message: 'The request could not be processed.',
};

/**
 * HTTP mapping of a database error:
 * - 23505 unique violation and 23P01 exclusion violation: 409 (someone else holds the seat / slot).
 * - 23514 from a CHECK constraint ("violates check constraint"): 422. Request data reached the
 *   database in a shape it refuses; validation should normally have caught it earlier.
 * - 23514 raised by our triggers (status machine, seat locks, ticket counts): 409. The data is
 *   well-formed but conflicts with the current state (hold expired, seat booked, ...).
 * - 23503 on insert/update (unknown referenced row): 422. On delete/update of a referenced row
 *   ("update or delete on table", NO ACTION foreign keys): 409.
 * - 23001 restrict violation (deleting a row that ON DELETE RESTRICT protects): 409.
 * - anything else: 500.
 */
export function mapDatabaseError(info: DatabaseErrorInfo): MappedDatabaseError {
  switch (info.sqlState) {
    case '23505':
    case '23P01':
    case '23001':
      return CONFLICT;
    case '23514':
      return /violates check constraint/.test(info.message) ? UNPROCESSABLE : CONFLICT;
    case '23503':
      return /^update or delete on table/.test(info.message) ? CONFLICT : UNPROCESSABLE;
    default:
      return { status: 500, code: 'internal_error', message: 'Something went wrong.' };
  }
}
