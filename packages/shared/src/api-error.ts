import { z } from 'zod';

/** Machine-readable error codes. The web app maps them to translated messages. */
export const apiErrorCodeSchema = z.enum([
  'bad_request',
  'not_found',
  'payload_too_large',
  'unsupported_media_type',
  'request_error',
  'internal_error',
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** Every API error response has this shape. Messages are generic and never contain internals. */
export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
