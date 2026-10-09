// Maps PostgreSQL errors to HTTP statuses by SQLSTATE only, never by message text: PostgreSQL may
// translate its messages (lc_messages), so text is only ever logged, not interpreted.
//
// Prisma (pg driver adapter) delivers database errors in two shapes:
// - statement errors: PrismaClientKnownRequestError, SQLSTATE in meta.driverAdapterError.cause
// - errors at COMMIT of an interactive transaction (deferred constraints, e.g. G12): a raw
//   DriverAdapterError, SQLSTATE in cause.originalCode
// Both are handled the same way here.

import type { ApiErrorCode } from '@kinemax/shared';
import { DOMAIN_SQLSTATE } from '../db/domain-error-codes.js';

export interface DatabaseErrorInfo {
  sqlState: string;
  /**
   * Constraint name when the adapter exposes it (unique, foreign key and RESTRICT violations).
   * The pg adapter does not pass it on for CHECK violations (23514).
   */
  constraint?: string;
  /** PostgreSQL's message, for server logs only. Never the "detail" field (it can contain row values). */
  message: string;
}

interface AdapterCause {
  originalCode?: unknown;
  originalMessage?: unknown;
  message?: unknown;
  constraint?: { index?: unknown };
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

/** SQLSTATE (plus constraint and message for logs) of a database error in either shape. */
export function databaseErrorInfo(error: unknown): DatabaseErrorInfo | undefined {
  const cause = causeOf(error);
  const sqlState = cause?.originalCode;
  if (typeof sqlState !== 'string' || !/^[0-9A-Z]{5}$/.test(sqlState)) return undefined;
  const message = cause?.originalMessage ?? cause?.message;
  const constraint = cause?.constraint?.index;
  return {
    sqlState,
    ...(typeof constraint === 'string' ? { constraint } : {}),
    message: typeof message === 'string' ? message : '',
  };
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
const INTERNAL: MappedDatabaseError = {
  status: 500,
  code: 'internal_error',
  message: 'Something went wrong.',
};

/**
 * 409 = well-formed, but conflicts with the current state: retrying after a refresh can succeed
 * (seat taken, slot taken, hold expired, booking already released, row still referenced).
 * 422 = the request itself describes something the database never accepts, whatever the state
 * (CHECK constraint, unknown referenced row, seat-level booking of a suite, wrong ticket count).
 */
const STATUS_BY_SQLSTATE: Readonly<Record<string, MappedDatabaseError>> = {
  '23505': CONFLICT, // unique violation (e.g. seat already locked)
  '23P01': CONFLICT, // exclusion violation (overlapping showtime)
  '23001': CONFLICT, // RESTRICT violation (row still referenced); all our FKs use RESTRICT/CASCADE/SET NULL
  '23514': UNPROCESSABLE, // CHECK constraint (our triggers no longer use this code)
  '23503': UNPROCESSABLE, // foreign key on insert/update: referenced row does not exist
  [DOMAIN_SQLSTATE.bookingTransition]: CONFLICT,
  [DOMAIN_SQLSTATE.holdExpired]: CONFLICT,
  [DOMAIN_SQLSTATE.reservationNeedsActiveBooking]: CONFLICT,
  [DOMAIN_SQLSTATE.hallBookingMode]: UNPROCESSABLE,
  [DOMAIN_SQLSTATE.seatTicketCount]: UNPROCESSABLE,
  [DOMAIN_SQLSTATE.seatTypeChange]: CONFLICT,
};

/** HTTP status for a SQLSTATE. Takes only the code, so message text can never influence it. */
export function mapDatabaseError(sqlState: string): MappedDatabaseError {
  return STATUS_BY_SQLSTATE[sqlState] ?? INTERNAL;
}
