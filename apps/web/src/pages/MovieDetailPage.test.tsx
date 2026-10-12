import type { MovieDetail } from '@kinemax/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { scheduleDays } from '../i18n/format';
import { LOCATION_STORAGE_KEY, PICKER_DISMISSED_KEY } from '../location/location-storage';
import { renderApp, stubCatalog, urlOf } from '../test/catalog';
import { group, showtimesAnswer } from '../test/showtimes';

const detail = (extra: Partial<MovieDetail> = {}): MovieDetail => ({
  slug: 'kodi',
  titleSq: 'Kodi Orbital 9',
  titleEn: 'Orbital Code 9',
  synopsisSq: 'Satelitët flasin me njëri-tjetrin.',
  synopsisEn: 'Satellites talk to each other.',
  ageRating: 'AGE_12',
  durationMinutes: 131,
  genres: ['SCI_FI', 'THRILLER'],
  releaseDate: '2026-09-30',
  posterPath: '/seed/posters/kodi.svg',
  backdropPath: '/seed/backdrops/kodi.svg',
  trailerYoutubeId: null,
  director: 'Valon Kurti',
  cast: ['Teuta Ramadani', 'Agon Selimi'],
  status: 'NOW_SHOWING',
  ...extra,
});

beforeEach(() => {
  window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
});

describe('MovieDetailPage', () => {
  it('shows the movie with badges, facts, synopsis and its own title and description', async () => {
    stubCatalog({
      movieDetail: { kodi: { movie: detail() } },
      showtimes: (url) => showtimesAnswer(url),
    });
    renderApp('/movies/kodi');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kodi Orbital 9' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 orë 11 min · Fantashkencë · Triller')).toBeInTheDocument();
    expect(screen.getByText('Nga mosha 12 vjeç')).toBeInTheDocument();
    expect(screen.getByText('30 shtator 2026')).toBeInTheDocument();
    expect(screen.getByText('Valon Kurti')).toBeInTheDocument();
    expect(screen.getByText('Teuta Ramadani, Agon Selimi')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Posteri i filmit Kodi Orbital 9' }),
    ).toBeInTheDocument();
    // 12+: no ID note; no trailer id: no trailer button.
    expect(screen.queryByText(/dokument identifikimi/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trailer' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(document.title).toBe('Kodi Orbital 9 · Kinemax');
    });
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Satelitët flasin me njëri-tjetrin.',
    );
  });

  it('shows the ID note for 15+ and 18+ movies and the trailer only after a click', async () => {
    stubCatalog({
      movieDetail: {
        kodi: { movie: detail({ ageRating: 'AGE_18', trailerYoutubeId: 'abcdefghijk' }) },
      },
      showtimes: (url) => showtimesAnswer(url),
    });
    renderApp('/movies/kodi');
    expect(
      await screen.findByText(
        "Ky film është për moshat 18+. Mund t'ju kërkohet dokument identifikimi.",
      ),
    ).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Trailer' }));
    expect(screen.getByTitle('Traileri: Kodi Orbital 9')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&rel=0',
    );
  });

  it('lists the showtimes of the chosen cinema by day for this movie only', async () => {
    const fetchMock = stubCatalog({
      movieDetail: { kodi: { movie: detail() } },
      showtimes: (url) =>
        showtimesAnswer(url, {
          groups: [
            group(),
            group({ hallType: { code: 'VIP_RECLINER', nameSq: 'VIP Recliner', nameEn: null } }),
          ],
        }),
    });
    const { router } = renderApp('/movies/kodi');
    const section = (await screen.findByRole('heading', { level: 2, name: 'Oraret' })).closest(
      'section',
    ) as HTMLElement;
    expect(within(section).getByText('Në Kinemax Prizren')).toBeInTheDocument();
    expect(await within(section).findAllByRole('heading', { level: 3 })).toHaveLength(2);
    const tabs = within(section).getAllByRole('tab');
    expect(tabs).toHaveLength(7);
    fireEvent.click(tabs[1] as HTMLElement);
    const days = scheduleDays('Europe/Belgrade');
    expect(router.state.location.search).toBe(`?date=${days[1] ?? ''}`);
    const urls = fetchMock.mock.calls.map(([input]) => urlOf(input));
    expect(urls).toContain(`/api/showtimes?location=prizren&date=${days[0] ?? ''}&movie=kodi`);
  });

  it('shows an empty day, the release date for coming soon, and a prompt without a cinema', async () => {
    stubCatalog({
      movieDetail: {
        kodi: { movie: detail() },
        soon: { movie: detail({ slug: 'soon', status: 'COMING_SOON', releaseDate: '2026-11-13' }) },
      },
      showtimes: (url) => showtimesAnswer(url, { empty: true }),
    });
    const first = renderApp('/movies/kodi');
    expect(await screen.findByText('Nuk ka shfaqje për këtë ditë')).toBeInTheDocument();
    first.unmount();

    const second = renderApp('/movies/soon');
    expect(await screen.findByText('Në kinema nga 13 nëntor 2026')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    second.unmount();

    window.localStorage.clear();
    window.sessionStorage.setItem(PICKER_DISMISSED_KEY, '1');
    renderApp('/movies/kodi');
    expect(
      await screen.findByText('Zgjidh kinemanë tënde për të parë oraret dhe për të blerë bileta.'),
    ).toBeInTheDocument();
  });

  it('renders the site 404 for an unknown movie and an error with retry otherwise', async () => {
    stubCatalog();
    const first = renderApp('/movies/no-such-movie');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Faqja nuk u gjet' }),
    ).toBeInTheDocument();
    expect(document.title).toBe('Faqja nuk u gjet · Kinemax');
    first.unmount();

    let calls = 0;
    stubCatalog({
      movieDetail: {
        get kodi() {
          calls += 1;
          return calls === 1 ? { status: 500, body: {} } : { movie: detail() };
        },
      },
      showtimes: (url) => showtimesAnswer(url),
    });
    renderApp('/movies/kodi');
    fireEvent.click(await screen.findByRole('button', { name: 'Provo përsëri' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kodi Orbital 9' }),
    ).toBeInTheDocument();
  });
});
