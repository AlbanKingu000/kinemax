// Test helpers for the public catalog: sample API data, a fetch stub that answers by URL and a
// renderer for the real routes with every provider the app uses.
import type { FeaturedMovie, LocationSummary, MovieSummary } from '@kinemax/shared';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { ToastProvider } from '../components/Toast/ToastProvider';
import { I18nProvider } from '../i18n/I18nProvider';
import type { Locale } from '../i18n/messages';
import { LocationProvider } from '../location/LocationProvider';
import { routes } from '../routes';

const location = (slug: string, city: string): LocationSummary => ({
  slug,
  name: `Kinemax ${city}`,
  city,
  address: `Rruga e ${city} 1`,
  timeZone: 'Europe/Belgrade',
  hallTypes: [
    { code: 'STANDARD', nameSq: 'Standard', nameEn: null, hallCount: 2 },
    { code: 'VIP_RECLINER', nameSq: 'VIP Recliner', nameEn: 'VIP Recliner', hallCount: 1 },
  ],
});

export const LOCATIONS: LocationSummary[] = [
  location('prishtine', 'Prishtinë'),
  location('prizren', 'Prizren'),
];

export const movie = (slug: string, extra: Partial<MovieSummary> = {}): MovieSummary => ({
  slug,
  titleSq: `Filmi ${slug}`,
  titleEn: `Movie ${slug}`,
  synopsisSq: `Përmbledhja e ${slug}`,
  synopsisEn: `Synopsis of ${slug}`,
  ageRating: 'AGE_12',
  durationMinutes: 112,
  genres: ['THRILLER'],
  releaseDate: '2026-11-13',
  posterPath: `/seed/posters/${slug}.svg`,
  formats: ['2D'],
  languageVersions: ['ORIGINAL_SQ_SUBTITLES'],
  ...extra,
});

export const featured = (slug: string, extra: Partial<FeaturedMovie> = {}): FeaturedMovie => ({
  ...movie(slug),
  backdropPath: null,
  trailerYoutubeId: null,
  ...extra,
});

/** A JSON body, an Error (network failure) or `{ status, body }` for other status codes. */
type Answer = unknown;

/** The URL of a fetch input, as a string. */
export const urlOf = (input: RequestInfo | URL): string =>
  input instanceof Request ? input.url : input.toString();

export interface CatalogStub {
  locations?: Answer;
  /** By location slug ('' = all locations). */
  nowShowing?: Record<string, Answer>;
  comingSoon?: Answer;
  featured?: Record<string, Answer>;
  /** /api/movies/:slug by slug. */
  movieDetail?: Record<string, Answer>;
  /** /api/showtimes: computed from the request URL. */
  showtimes?: (url: URL) => Answer;
  /** /api/showtimes/:id by id. */
  showtime?: Record<string, Answer>;
  /** /api/showtimes/:id/seatmap by id: a body, or a function called on every request. */
  seatmap?: Record<string, unknown>;
  /** /api/bookings/*: answers by method and path (needs stubAuth, which sees the method). */
  bookings?: (request: { method: string; path: string; body: unknown }) => Answer;
}

const isStatus = (value: unknown): value is { status: number; body: unknown } =>
  typeof value === 'object' && value !== null && 'status' in value && 'body' in value;

/** A fetch Response for an Answer (undefined = 404, 204 = empty). */
export function respond(value: Answer): Promise<Response> {
  if (value instanceof Error) return Promise.reject(value);
  const { status, body } = isStatus(value) ? value : { status: 200, body: value };
  if (status === 204) return Promise.resolve(new Response(null, { status }));
  return Promise.resolve(
    new Response(JSON.stringify(body ?? { error: { code: 'not_found', message: 'x' } }), {
      status: body === undefined ? 404 : status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

/** Stubs fetch for the public catalog API. Unknown URLs answer 404. */
export function stubCatalog(stub: CatalogStub = {}) {
  const answer = respond;
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = new URL(urlOf(input), 'http://localhost');
    const slug = url.searchParams.get('location') ?? '';
    if (url.pathname === '/api/locations')
      return answer(stub.locations ?? { locations: LOCATIONS });
    if (url.pathname === '/api/movies' && url.searchParams.get('status') === 'COMING_SOON') {
      return answer(stub.comingSoon ?? { movies: [movie('coming-a', { formats: [] })] });
    }
    if (url.pathname === '/api/movies') {
      return answer(stub.nowShowing?.[slug] ?? { movies: [movie(`now-${slug || 'all'}`)] });
    }
    if (url.pathname.startsWith('/api/movies/')) {
      return answer(stub.movieDetail?.[decodeURIComponent(url.pathname.slice(12))]);
    }
    if (url.pathname === '/api/showtimes') return answer(stub.showtimes?.(url));
    const seatmapMatch = /^\/api\/showtimes\/([^/]+)\/seatmap$/.exec(url.pathname);
    if (seatmapMatch) {
      const answer2 = stub.seatmap?.[decodeURIComponent(seatmapMatch[1] ?? '')];
      return answer(typeof answer2 === 'function' ? (answer2 as () => Answer)() : answer2);
    }
    if (url.pathname.startsWith('/api/showtimes/')) {
      return answer(stub.showtime?.[decodeURIComponent(url.pathname.slice(15))]);
    }
    if (url.pathname === '/api/featured') {
      return answer(stub.featured?.[slug] ?? { movie: featured(`featured-${slug || 'all'}`) });
    }
    return answer(undefined);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Renders the app routes at `path` with the same providers as main.tsx. */
export function renderApp(path = '/', options: { locale?: Locale } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const result = render(
    <I18nProvider {...(options.locale ? { locale: options.locale } : {})}>
      <ToastProvider>
        <AuthProvider>
          <LocationProvider>
            <RouterProvider router={router} />
          </LocationProvider>
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>,
  );
  return { ...result, router };
}
