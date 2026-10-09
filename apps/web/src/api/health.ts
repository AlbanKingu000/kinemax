import { healthResponseSchema, type HealthResponse } from '@kinemax/shared';

/**
 * Fetches the API health. The API answers 503 with a valid body when the database is down, so
 * the body is parsed for any status. Throws when the API cannot be reached or answers garbage.
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/health', {
    headers: { Accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  const body: unknown = await response.json();
  return healthResponseSchema.parse(body);
}
