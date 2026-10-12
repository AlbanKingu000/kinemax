// Test helpers for the public catalog: sample API data, a fetch stub that answers by URL and a
// renderer for the real routes with every provider the app uses.
import type { FeaturedMovie, LocationSummary, MovieSummary } from '@kinemax/shared';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
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
  hallTypes: [{ code: 'STANDARD', nameSq: 'Standard', nameEn: null, hallCount: 2 }],
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
}

const isStatus = (value: unknown): value is { status: number; body: unknown } =>
  typeof value === 'object' && value !== null && 'status' in value && 'body' in value;

/** Stubs fetch for /api/locations, /api/movies and /api/featured. Unknown URLs answer 404. */
export function stubCatalog(stub: CatalogStub = {}) {
  const answer = (value: Answer) => {
    if (value instanceof Error) return Promise.reject(value);
    const { status, body } = isStatus(value) ? value : { status: 200, body: value };
    return Promise.resolve(
      new Response(JSON.stringify(body ?? { error: { code: 'not_found', message: 'x' } }), {
        status: body === undefined ? 404 : status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
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
        <LocationProvider>
          <RouterProvider router={router} />
        </LocationProvider>
      </ToastProvider>
    </I18nProvider>,
  );
  return { ...result, router };
}
