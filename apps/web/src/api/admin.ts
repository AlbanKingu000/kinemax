// The admin panel's API client: every call goes through the one fetch wrapper (CSRF, errors) and
// validates the answer with the shared schemas. The server re-checks role and cinema every time.
import {
  adminLocationsResponseSchema,
  adminMovieResponseSchema,
  adminMoviesResponseSchema,
  statsResponseSchema,
  type AdminLocation,
  type AdminMovie,
  type MovieImageKind,
  type MovieInput,
  type MovieStatus,
  type StatsRange,
  type StatsResponse,
} from '@kinemax/shared';
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

/** Dashboard numbers for one cinema, or all the caller's cinemas when `location` is null. */
export function fetchStats(
  location: string | null,
  range: StatsRange,
  signal?: AbortSignal,
): Promise<StatsResponse> {
  return apiRequest(`/api/admin/stats${adminQuery({ location, range })}`, {
    schema: statsResponseSchema,
    ...opts(signal),
  });
}

export interface AdminMoviesFilter {
  q?: string;
  status?: MovieStatus;
}

export async function fetchAdminMovies(
  filter: AdminMoviesFilter,
  signal?: AbortSignal,
): Promise<AdminMovie[]> {
  const query = adminQuery({ q: filter.q || undefined, status: filter.status });
  const res = await apiRequest(`/api/admin/movies${query}`, {
    schema: adminMoviesResponseSchema,
    ...opts(signal),
  });
  return res.movies;
}

export async function fetchAdminMovie(id: string, signal?: AbortSignal): Promise<AdminMovie> {
  const res = await apiRequest(`/api/admin/movies/${encodeURIComponent(id)}`, {
    schema: adminMovieResponseSchema,
    ...opts(signal),
  });
  return res.movie;
}

export async function saveMovie(
  id: string | null,
  input: Partial<MovieInput>,
): Promise<AdminMovie> {
  const res = await apiRequest(
    id ? `/api/admin/movies/${encodeURIComponent(id)}` : '/api/admin/movies',
    {
      method: id ? 'PATCH' : 'POST',
      body: input,
      schema: adminMovieResponseSchema,
    },
  );
  return res.movie;
}

export function deleteMovie(id: string): Promise<undefined> {
  return apiRequest(`/api/admin/movies/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Uploads the file's bytes; the server decides the type and checks size and dimensions. */
export async function uploadMovieImage(
  id: string,
  kind: MovieImageKind,
  file: Blob,
): Promise<AdminMovie> {
  const res = await apiRequest(`/api/admin/movies/${encodeURIComponent(id)}/images/${kind}`, {
    method: 'POST',
    body: file,
    schema: adminMovieResponseSchema,
  });
  return res.movie;
}
