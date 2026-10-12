import {
  featuredResponseSchema,
  locationsResponseSchema,
  moviesResponseSchema,
  type FeaturedMovie,
  type LocationSummary,
  type MovieListStatus,
  type MovieSummary,
} from '@kinemax/shared';
import type { ZodType } from 'zod';

/** Thrown for non-2xx answers; the UI shows a generic, translated error. */
export class ApiRequestError extends Error {
  override name = 'ApiRequestError';
  constructor(readonly status: number) {
    super(`API request failed with status ${String(status)}`);
  }
}

async function getJson<T>(path: string, schema: ZodType<T>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    headers: { Accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new ApiRequestError(response.status);
  return schema.parse(await response.json());
}

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
