import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCATION_STORAGE_KEY, PICKER_DISMISSED_KEY } from '../location/location-storage';
import { featured, movie, renderApp, stubCatalog, urlOf } from '../test/catalog';

beforeEach(() => {
  // jsdom has no canvas; the hero background skips the dust without a context.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  window.sessionStorage.clear();
});

const picker = () => screen.findByRole('dialog', { name: 'Zgjidh kinemanë' });
const requested = (fetchMock: ReturnType<typeof stubCatalog>) =>
  fetchMock.mock.calls.map(([input]) => urlOf(input));

describe('HomePage: cinema choice', () => {
  it('asks on the first visit, then shows the chosen cinema everywhere and remembers it', async () => {
    const fetchMock = stubCatalog();
    renderApp('/');

    const dialog = await picker();
    expect(within(dialog).getByRole('button', { name: /Prishtinë/ })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Prizren/ }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(LOCATION_STORAGE_KEY)).toBe('prizren');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Filmi featured-prizren' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Filmi now-prizren' })).toHaveAttribute(
      'href',
      '/movies/now-prizren',
    );
    expect(screen.getByText('Në Kinemax Prizren')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Kinemaja: Prizren' }).length).toBeGreaterThan(0);
    expect(requested(fetchMock)).toContain('/api/featured?location=prizren');
    expect(requested(fetchMock)).toContain('/api/movies?status=NOW_SHOWING&location=prizren');
  });

  it('uses a saved choice without asking', async () => {
    window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prishtine');
    stubCatalog();
    renderApp('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Filmi featured-prishtine' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('drops a saved cinema that no longer exists and asks again', async () => {
    window.localStorage.setItem(LOCATION_STORAGE_KEY, 'closed-cinema');
    const fetchMock = stubCatalog();
    renderApp('/');
    expect(await picker()).toBeInTheDocument();
    expect(window.localStorage.getItem(LOCATION_STORAGE_KEY)).toBeNull();
    expect(requested(fetchMock).some((url) => url.includes('closed-cinema'))).toBe(false);
  });

  it('can be closed without choosing: all cinemas, and no new question in this session', async () => {
    const fetchMock = stubCatalog();
    const first = renderApp('/');
    fireEvent.click(within(await picker()).getByRole('button', { name: 'Mbyll' }));

    expect(window.sessionStorage.getItem(PICKER_DISMISSED_KEY)).toBe('1');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Filmi featured-all' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Në të gjitha kinematë')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Zgjidh kinemanë' }).length).toBeGreaterThan(0);
    expect(requested(fetchMock)).toContain('/api/movies?status=NOW_SHOWING');
    first.unmount();

    renderApp('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Filmi featured-all' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('still works when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    stubCatalog();
    renderApp('/');
    fireEvent.click(within(await picker()).getByRole('button', { name: /Prizren/ }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Filmi featured-prizren' }),
    ).toBeInTheDocument();
  });

  it('shows an error with retry in the picker when the cinemas cannot be loaded', async () => {
    window.sessionStorage.setItem(PICKER_DISMISSED_KEY, '1');
    const fetchMock = stubCatalog({ locations: new TypeError('offline') });
    renderApp('/');
    // Without cinemas the site still shows data for all of them.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Filmi featured-all' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Zgjidh kinemanë' })[0] as HTMLElement);
    const dialog = await picker();
    expect(within(dialog).getByText('Kinematë nuk u ngarkuan.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Provo përsëri' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([u]) => urlOf(u) === '/api/locations')).toHaveLength(2);
    });
  });
});

describe('HomePage: hero and movie lists', () => {
  beforeEach(() => {
    window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
  });

  it('shows the featured movie with badges, poster, synopsis and a ticket link', async () => {
    stubCatalog({
      featured: {
        prizren: {
          movie: featured('kodi', {
            titleSq: 'Kodi Orbital 9',
            ageRating: 'AGE_12',
            durationMinutes: 131,
            genres: ['SCI_FI', 'THRILLER'],
            formats: ['2D', '3D'],
            languageVersions: ['ORIGINAL_SQ_SUBTITLES', 'DUBBED_SQ'],
          }),
        },
      },
    });
    renderApp('/');
    const title = await screen.findByRole('heading', { level: 1, name: 'Kodi Orbital 9' });
    const hero = title.closest('section') as HTMLElement;
    expect(within(hero).getByText('Nga mosha 12 vjeç')).toBeInTheDocument();
    expect(within(hero).getByText('2 orë 11 min · Fantashkencë · Triller')).toBeInTheDocument();
    expect(within(hero).getByText('3D')).toBeInTheDocument();
    expect(within(hero).getByText('Dublim shqip')).toBeInTheDocument();
    expect(
      within(hero).getByRole('img', { name: 'Posteri i filmit Kodi Orbital 9' }),
    ).toHaveAttribute('width', '600');
    expect(within(hero).getByRole('link', { name: 'Bli biletë' })).toHaveAttribute(
      'href',
      '/movies/kodi',
    );
    // No trailer id: no trailer button.
    expect(within(hero).queryByRole('button', { name: 'Trailer' })).not.toBeInTheDocument();
  });

  it('loads the trailer from youtube-nocookie.com only after the click', async () => {
    stubCatalog({
      featured: { prizren: { movie: featured('kodi', { trailerYoutubeId: 'abcdefghijk' }) } },
    });
    renderApp('/');
    const button = await screen.findByRole('button', { name: 'Trailer' });
    expect(document.querySelector('iframe')).toBeNull();
    fireEvent.click(button);
    const dialog = screen.getByRole('dialog', { name: 'Traileri: Filmi kodi' });
    expect(within(dialog).getByTitle('Traileri: Filmi kodi')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&rel=0',
    );
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('shows "no featured movie" when nothing is scheduled', async () => {
    stubCatalog({ featured: { prizren: { movie: null } } });
    renderApp('/');
    expect(await screen.findByText(/Programi i ri po përgatitet/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Kinemax' })).toBeInTheDocument();
  });

  it('shows loading skeletons, then a friendly error with a working retry', async () => {
    let fail = true;
    const fetchMock = stubCatalog();
    const original = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (fail && (url.startsWith('/api/featured') || url.includes('NOW_SHOWING'))) {
        return Promise.resolve(new Response('{}', { status: 500 }));
      }
      return original ? original(input) : Promise.reject(new Error('no stub'));
    });
    renderApp('/');
    expect(screen.getAllByText('Duke ngarkuar filmat…').length).toBeGreaterThan(0);

    expect(await screen.findByText('Filmi kryesor nuk u ngarkua.')).toBeInTheDocument();
    expect(screen.getByText(/Filmat nuk u ngarkuan/)).toBeInTheDocument();
    // The page keeps its h1 in the error state.
    expect(screen.getByRole('heading', { level: 1, name: 'Kinemax' })).toBeInTheDocument();

    fail = false;
    for (const retry of screen.getAllByRole('button', { name: 'Provo përsëri' })) {
      fireEvent.click(retry);
    }
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Filmi featured-prizren' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Filmi now-prizren' })).toBeInTheDocument();
  });

  it('shows an empty state for a cinema without movies, with a way to change it', async () => {
    stubCatalog({ nowShowing: { prizren: { movies: [] } } });
    renderApp('/');
    expect(await screen.findByText('Asnjë film për momentin')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ndrysho kinemanë' }));
    expect(await picker()).toBeInTheDocument();
  });

  it('lists coming soon movies with the release date in the current language', async () => {
    stubCatalog({
      comingSoon: {
        movies: [
          movie('soon', { titleEn: null, releaseDate: '2026-11-13', formats: [] }),
          movie('later', { releaseDate: '2026-12-04', formats: [] }),
        ],
      },
    });
    const { unmount } = renderApp('/');
    const section = (await screen.findByRole('heading', { level: 2, name: 'Së shpejti' })).closest(
      'section',
    ) as HTMLElement;
    expect(await within(section).findByText('Në kinema nga 13 nëntor 2026')).toBeInTheDocument();
    unmount();

    renderApp('/', { locale: 'en' });
    const en = (await screen.findByRole('heading', { level: 2, name: 'Coming soon' })).closest(
      'section',
    ) as HTMLElement;
    expect(await within(en).findByText('In cinemas from 4 December 2026')).toBeInTheDocument();
    // No English title: the Albanian one is shown.
    expect(within(en).getByRole('link', { name: 'Filmi soon' })).toBeInTheDocument();
    expect(within(en).getByRole('link', { name: 'Movie later' })).toBeInTheDocument();
  });

  it('sets the page title and description, and updates them with the language', async () => {
    stubCatalog();
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Filmi featured-prizren' });
    expect(document.title).toBe('Kinemax · Kinema premium');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toMatch(
      /Prishtinë, Prizren/,
    );
    act(() => {
      fireEvent.click(screen.getAllByRole('button', { name: 'EN (English)' })[0] as HTMLElement);
    });
    expect(document.title).toBe('Kinemax · Premium cinema');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('heading', { level: 2, name: 'Now showing' })).toBeInTheDocument();
  });
});
