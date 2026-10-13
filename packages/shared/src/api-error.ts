import { z } from 'zod';

/** Machine-readable error codes. The web app maps them to translated messages. */
export const apiErrorCodeSchema = z.enum([
  'bad_request',
  'validation_failed',
  'unauthorized',
  'invalid_credentials',
  'forbidden',
  /** Missing or stale CSRF token: fetch a new one from GET /api/auth/csrf and retry once. */
  'csrf_invalid',
  'not_found',
  /** The resource existed but is over (e.g. a show that already started). */
  'gone',
  'conflict',
  'payload_too_large',
  'unsupported_media_type',
  'unprocessable',
  'rate_limited',
  'request_error',
  'internal_error',
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** A field that failed validation: its path and a reason code, never the submitted value. */
export const apiFieldIssueSchema = z.object({
  path: z.string(),
  code: z.string(),
});

export type ApiFieldIssue = z.infer<typeof apiFieldIssueSchema>;

/** Every API error response has this shape. Messages are generic and never contain internals. */
export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    fields: z.array(apiFieldIssueSchema).optional(),
    /** Seat hold conflicts (409): the requested seats someone else holds now. */
    takenSeatIds: z.array(z.uuid()).optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
