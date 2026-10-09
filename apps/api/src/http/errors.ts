import type { ApiErrorCode, ApiErrorResponse } from '@kinemax/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { describeError, type Logger } from '../logger.js';

const CLIENT_ERRORS: Partial<Record<number, { code: ApiErrorCode; message: string }>> = {
  400: { code: 'bad_request', message: 'The request could not be processed.' },
  413: { code: 'payload_too_large', message: 'The request body is too large.' },
  415: { code: 'unsupported_media_type', message: 'The request content type is not supported.' },
};

export function errorBody(code: ApiErrorCode, message: string): ApiErrorResponse {
  return { error: { code, message } };
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json(errorBody('not_found', 'Not found.'));
};

/**
 * Central error handler. Clients only ever get a generic code and message; details (including
 * stack traces) go to the server log for 5xx errors.
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    if (res.headersSent) {
      // Too late to send a clean error body; let Express close the connection.
      next(error);
      return;
    }
    const status = clientErrorStatus(error);
    if (status === undefined) {
      logger.error('Unhandled error', {
        method: req.method,
        path: req.path,
        ...describeError(error),
      });
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
