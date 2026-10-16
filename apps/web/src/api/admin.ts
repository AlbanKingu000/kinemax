// The admin panel's API client: every call goes through the one fetch wrapper (CSRF, errors) and
// validates the answer with the shared schemas. The server re-checks role and cinema every time.
import {
  adminHallsResponseSchema,
  adminLocationsResponseSchema,
  adminMovieResponseSchema,
  adminMoviesResponseSchema,
  adminPricesResponseSchema,
  appSettingsSchema,
  adminShowtimeResponseSchema,
  adminShowtimesResponseSchema,
  bulkCreateResponseSchema,
  bulkPreviewResponseSchema,
  deactivateResponseSchema,
  hallLayoutResponseSchema,
  statsResponseSchema,
  type AdminShowtime,
  type AdminShowtimesResponse,
  type BulkPreviewResponse,
  type BulkShowtimesInput,
  type DeactivateResponse,
  type HallLayoutInput,
  type HallLayoutResponse,
  type ShowtimeInput,
  type AdminHallsResponse,
  type AdminLocation,
  type AdminMovie,
  type AdminPricesResponse,
  type AppSettingsInput,
  type PriceKind,
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

export function fetchAdminShowtimes(
  location: string,
  date: string,
  signal?: AbortSignal,
): Promise<AdminShowtimesResponse> {
  return apiRequest(`/api/admin/showtimes${adminQuery({ location, date })}`, {
    schema: adminShowtimesResponseSchema,
    ...opts(signal),
  });
}

/** Creates a show (id null) or changes one; the server computes the end. */
export async function saveShowtime(
  id: string | null,
  input: Partial<ShowtimeInput>,
): Promise<AdminShowtime> {
  const res = await apiRequest(
    id ? `/api/admin/showtimes/${encodeURIComponent(id)}` : '/api/admin/showtimes',
    { method: id ? 'PATCH' : 'POST', body: input, schema: adminShowtimeResponseSchema },
  );
  return res.showtime;
}

export function previewBulkShowtimes(input: BulkShowtimesInput): Promise<BulkPreviewResponse> {
  return apiRequest('/api/admin/showtimes/bulk/preview', {
    method: 'POST',
    body: input,
    schema: bulkPreviewResponseSchema,
  });
}

export async function createBulkShowtimes(input: BulkShowtimesInput): Promise<number> {
  return (
    await apiRequest('/api/admin/showtimes/bulk', {
      method: 'POST',
      body: input,
      schema: bulkCreateResponseSchema,
    })
  ).created;
}

export function deactivateShowtime(id: string): Promise<DeactivateResponse> {
  return apiRequest(`/api/admin/showtimes/${encodeURIComponent(id)}/deactivate`, {
    method: 'POST',
    schema: deactivateResponseSchema,
  });
}

export async function activateShowtime(id: string): Promise<AdminShowtime> {
  return (
    await apiRequest(`/api/admin/showtimes/${encodeURIComponent(id)}/activate`, {
      method: 'POST',
      schema: adminShowtimeResponseSchema,
    })
  ).showtime;
}

export async function fetchAdminHalls(
  location: string,
  signal?: AbortSignal,
): Promise<AdminHallsResponse['halls']> {
  return (
    await apiRequest(`/api/admin/halls${adminQuery({ location })}`, {
      schema: adminHallsResponseSchema,
      ...opts(signal),
    })
  ).halls;
}

export function fetchHallLayout(id: string, signal?: AbortSignal): Promise<HallLayoutResponse> {
  return apiRequest(`/api/admin/halls/${encodeURIComponent(id)}/layout`, {
    schema: hallLayoutResponseSchema,
    ...opts(signal),
  });
}

/** Saves the whole layout as one batch; the answer is the layout as stored. */
export function saveHallLayout(id: string, input: HallLayoutInput): Promise<HallLayoutResponse> {
  return apiRequest(`/api/admin/halls/${encodeURIComponent(id)}/layout`, {
    method: 'PUT',
    body: input,
    schema: hallLayoutResponseSchema,
  });
}

export function fetchAdminPrices(signal?: AbortSignal): Promise<AdminPricesResponse> {
  return apiRequest('/api/admin/prices', { schema: adminPricesResponseSchema, ...opts(signal) });
}

/** Sets a rule (a new version from now); for "adjustment" with an id it replaces that rule. */
export function savePriceRule(kind: PriceKind, body: object, id?: string): Promise<undefined> {
  return apiRequest(
    id ? `/api/admin/prices/${kind}/${encodeURIComponent(id)}` : `/api/admin/prices/${kind}`,
    {
      method: id ? 'PUT' : 'POST',
      body,
    },
  );
}

export function endPriceRule(kind: PriceKind, id: string): Promise<undefined> {
  return apiRequest(`/api/admin/prices/${kind}/${encodeURIComponent(id)}/end`, { method: 'POST' });
}

export function fetchSettings(signal?: AbortSignal): Promise<AppSettingsInput> {
  return apiRequest('/api/admin/settings', { schema: appSettingsSchema, ...opts(signal) });
}

export function saveSettings(input: AppSettingsInput): Promise<AppSettingsInput> {
  return apiRequest('/api/admin/settings', {
    method: 'PUT',
    body: input,
    schema: appSettingsSchema,
  });
}
