import {
  featuredResponseSchema,
  locationsResponseSchema,
  movieDetailResponseSchema,
  moviesResponseSchema,
  showtimeDetailResponseSchema,
  showtimesResponseSchema,
  type FeaturedMovie,
  type LocationSummary,
  type MovieDetail,
  type MovieListStatus,
  type MovieSummary,
  type ShowtimeDetailResponse,
  type ShowtimesResponse,
} from '@kinemax/shared';
import type { ZodType } from 'zod';
import { apiRequest } from './http';

export { ApiRequestError } from './http';

const getJson = <T>(path: string, schema: ZodType<T>, signal?: AbortSignal): Promise<T> =>
  apiRequest(path, { schema, ...(signal ? { signal } : {}) });

const withLocation = (params: Record<string, string>, location?: string) =>
  new URLSearchParams(location ? { ...params, location } : params).toString();

export async function fetchLocations(signal?: AbortSignal): Promise<LocationSummary[]> {
  return (await getJson('/api/locations', locationsResponseSchema, signal)).locations;
}

export async function fetchMovies(
  status: MovieListStatus,
  location: string | undefined,
  signal?: AbortSignal,
): Promise<MovieSummary[]> {
  const query = withLocation({ status }, location);
  return (await getJson(`/api/movies?${query}`, moviesResponseSchema, signal)).movies;
}

export async function fetchFeatured(
  location: string | undefined,
  signal?: AbortSignal,
): Promise<FeaturedMovie | null> {
  const query = withLocation({}, location);
  return (await getJson(`/api/featured${query ? `?${query}` : ''}`, featuredResponseSchema, signal))
    .movie;
}

export async function fetchMovie(slug: string, signal?: AbortSignal): Promise<MovieDetail> {
  return (
    await getJson(`/api/movies/${encodeURIComponent(slug)}`, movieDetailResponseSchema, signal)
  ).movie;
}

export interface ShowtimesFilter {
  location: string;
  date: string;
  movie?: string;
  hallType?: readonly string[];
  format?: readonly string[];
  language?: readonly string[];
}

/** Query string for /api/showtimes; empty filters are left out. */
export function showtimesQuery(filter: ShowtimesFilter): string {
  const params = new URLSearchParams({ location: filter.location, date: filter.date });
  if (filter.movie) params.set('movie', filter.movie);
  for (const key of ['hallType', 'format', 'language'] as const) {
    const values = filter[key];
    if (values && values.length > 0) params.set(key, values.join(','));
  }
  return params.toString();
}

export async function fetchShowtimes(
  filter: ShowtimesFilter,
  signal?: AbortSignal,
): Promise<ShowtimesResponse> {
  return getJson(`/api/showtimes?${showtimesQuery(filter)}`, showtimesResponseSchema, signal);
}

export async function fetchShowtime(
  id: string,
  signal?: AbortSignal,
): Promise<ShowtimeDetailResponse['showtime']> {
  return (
    await getJson(`/api/showtimes/${encodeURIComponent(id)}`, showtimeDetailResponseSchema, signal)
  ).showtime;
}
