import { z } from 'zod';

/** Response body of `GET /api/health`. */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  db: z.enum(['up', 'down']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
