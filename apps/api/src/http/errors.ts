import type { ApiErrorCode, ApiErrorResponse, ApiFieldIssue } from '@kinemax/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { describeError, type Logger } from '../logger.js';
import { databaseErrorInfo, mapDatabaseError } from './db-errors.js';

const CLIENT_ERRORS: Partial<Record<number, { code: ApiErrorCode; message: string }>> = {
  400: { code: 'bad_request', message: 'The request could not be processed.' },
  413: { code: 'payload_too_large', message: 'The request body is too large.' },
  415: { code: 'unsupported_media_type', message: 'The request content type is not supported.' },
};

/** An error with a status, code and generic message that is safe to send to the client. */
export class HttpError extends Error {
  override name = 'HttpError';
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly options: {
      fields?: ApiFieldIssue[];
      headers?: Record<string, string>;
      takenSeatIds?: string[];
    } = {},
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, 'unauthorized', 'Please sign in.');
export const forbidden = () => new HttpError(403, 'forbidden', 'You are not allowed to do this.');

export function errorBody(
  code: ApiErrorCode,
  message: string,
  fields?: ApiFieldIssue[],
  takenSeatIds?: string[],
): ApiErrorResponse {
  return {
    error: {
      code,
      message,
      ...(fields ? { fields } : {}),
      ...(takenSeatIds ? { takenSeatIds } : {}),
    },
  };
}

/**
 * Parses untrusted input with a zod schema. On failure throws a 400 listing the failing field paths
 * and reason codes, never the submitted values.
 */
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields = result.error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    code: issue.code,
  }));
  throw new HttpError(400, 'validation_failed', 'The request data is invalid.', { fields });
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json(errorBody('not_found', 'Not found.'));
};

/**
 * Central error handler. Clients only ever get a generic code and message; details go to the
 * server log (stack traces for unexpected errors, SQLSTATE + PostgreSQL message for database
 * errors; never request bodies, passwords, tokens or cookies).
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    if (res.headersSent) {
      // Too late to send a clean error body; let Express close the connection.
      next(error);
      return;
    }
    const where = { method: req.method, path: req.path };

    if (error instanceof HttpError) {
      for (const [name, value] of Object.entries(error.options.headers ?? {})) res.set(name, value);
      res
        .status(error.status)
        .json(
          errorBody(error.code, error.message, error.options.fields, error.options.takenSeatIds),
        );
      return;
    }

    const dbError = databaseErrorInfo(error);
    if (dbError) {
      const mapped = mapDatabaseError(dbError.sqlState);
      const log = mapped.status >= 500 ? logger.error : logger.warn;
      log('Database error', {
        ...where,
        sqlState: dbError.sqlState,
        ...(dbError.constraint ? { constraint: dbError.constraint } : {}),
        // For humans reading the log only; the mapping above never looks at it.
        dbMessage: dbError.message,
        status: mapped.status,
      });
      res.status(mapped.status).json(errorBody(mapped.code, mapped.message));
      return;
    }

    const status = clientErrorStatus(error);
    if (status === undefined) {
      logger.error('Unhandled error', { ...where, ...describeError(error) });
      res.status(500).json(errorBody('internal_error', 'Something went wrong.'));
      return;
    }
    const known = CLIENT_ERRORS[status];
    res
      .status(status)
      .json(errorBody(known?.code ?? 'request_error', known?.message ?? 'The request failed.'));
  };
}

/** 4xx status of an error the HTTP layer marked as safe to expose (body-parser, http-errors). */
function clientErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { status, expose } = error as { status?: unknown; expose?: unknown };
  if (typeof status === 'number' && status >= 400 && status < 500 && expose === true) {
    return status;
  }
  return undefined;
}
