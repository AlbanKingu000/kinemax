// The admin panel's API client: every call goes through the one fetch wrapper (CSRF, errors) and
// validates the answer with the shared schemas. The server re-checks role and cinema every time.
import { adminLocationsResponseSchema, type AdminLocation } from '@kinemax/shared';
import { apiRequest } from './http';

const opts = (signal?: AbortSignal) => (signal ? { signal } : {});

/** Query string from the defined values only ("" when there are none). */
export function adminQuery(params: Record<string, string | number | undefined | null>): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== null,
  );
  return entries.length === 0
    ? ''
    : `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`;
}

export async function fetchAdminLocations(signal?: AbortSignal): Promise<AdminLocation[]> {
  const res = await apiRequest('/api/admin/locations', {
    schema: adminLocationsResponseSchema,
    ...opts(signal),
  });
  return res.locations;
}
