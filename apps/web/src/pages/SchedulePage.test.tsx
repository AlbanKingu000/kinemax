import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { scheduleDays } from '../i18n/format';
import { LOCATION_STORAGE_KEY, PICKER_DISMISSED_KEY } from '../location/location-storage';
import { renderApp, stubCatalog, urlOf } from '../test/catalog';
import { group, showtimesAnswer } from '../test/showtimes';

const days = scheduleDays('Europe/Belgrade');

beforeEach(() => {
  window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
});

/** Showtimes requests the page made, as query objects. */
const requests = (fetchMock: ReturnType<typeof stubCatalog>) =>
  fetchMock.mock.calls
    .map(([input]) => new URL(urlOf(input), 'http://localhost'))
    .filter((url) => url.pathname === '/api/showtimes')
    .map((url) => Object.fromEntries(url.searchParams));

const search = (router: ReturnType<typeof renderApp>['router']) =>
  Object.fromEntries(new URLSearchParams(router.state.location.search));

describe('SchedulePage', () => {
  it('shows 7 day tabs (today first) and the movies of the chosen cinema, grouped', async () => {
    const fetchMock = stubCatalog({
      showtimes: (url) =>
        showtimesAnswer(url, {
          groups: [group(), group({ format: '3D', languageVersion: 'DUBBED_SQ' })],
        }),
    });
    renderApp('/schedule');
    expect(screen.getByRole('heading', { level: 1, name: 'Orari' })).toBeInTheDocument();
    const tabs = await screen.findAllByRole('tab');
    expect(tabs).toHaveLength(7);
    expect(tabs[0]).toHaveTextContent(/^Sot/);
    expect(tabs[1]).toHaveTextContent(/^Nesër/);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    const movie = await screen.findByRole('article');
    expect(
      within(movie).getByRole('heading', { level: 2, name: 'Filmi film-a' }),
    ).toBeInTheDocument();
    expect(within(movie).getByRole('link', { name: 'Filmi film-a' })).toHaveAttribute(
      'href',
      '/movies/film-a',
    );
    expect(within(movie).getAllByRole('heading', { level: 3 })).toHaveLength(2);
    expect(requests(fetchMock)).toEqual([{ location: 'prizren', date: days[0] }]);
    expect(screen.getByText('Në Kinemax Prizren')).toBeInTheDocument();
    expect(document.title).toBe('Orari · Kinemax');
  });

  it('keeps the day in the URL and moves between days with the keyboard', async () => {
    const fetchMock = stubCatalog({ showtimes: (url) => showtimesAnswer(url) });
    const { router } = renderApp('/schedule');
    const tabs = await screen.findAllByRole('tab');
    fireEvent.click(tabs[2] as HTMLElement);
    expect(search(router)).toEqual({ date: days[2] });
    await waitFor(() => {
      expect(requests(fetchMock).at(-1)).toEqual({ location: 'prizren', date: days[2] });
    });

    fireEvent.keyDown(screen.getAllByRole('tab')[2] as HTMLElement, { key: 'ArrowRight' });
    expect(search(router).date).toBe(days[3]);
    expect(screen.getAllByRole('tab')[3]).toHaveFocus();
    fireEvent.keyDown(screen.getAllByRole('tab')[3] as HTMLElement, { key: 'Home' });
    expect(search(router).date).toBe(days[0]);
  });

  it('toggles filter chips into the URL and the request, and restores them from the URL', async () => {
    const fetchMock = stubCatalog({ showtimes: (url) => showtimesAnswer(url) });
    const { router, unmount } = renderApp('/schedule');
    await screen.findByRole('article');

    fireEvent.click(screen.getByRole('button', { name: 'VIP Recliner' }));
    fireEvent.click(screen.getByRole('button', { name: '3D' }));
    fireEvent.click(screen.getByRole('button', { name: 'Standard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dublim shqip' }));
    // Multi-select within a filter, in the order of the chips.
    expect(search(router)).toEqual({
      hallType: 'STANDARD,VIP_RECLINER',
      format: '3D',
      language: 'DUBBED_SQ',
    });
    await waitFor(() => {
      expect(requests(fetchMock).at(-1)).toEqual({
        location: 'prizren',
        date: days[0],
        hallType: 'STANDARD,VIP_RECLINER',
        format: '3D',
        language: 'DUBBED_SQ',
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'VIP Recliner' }));
    expect(search(router).hallType).toBe('STANDARD');
    unmount();

    // A shared link restores the same view; unknown values are ignored.
    renderApp(`/schedule?date=${days[1] ?? ''}&format=3D,4D&language=DUBBED_SQ`);
    expect(await screen.findByRole('button', { name: '3D' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '2D' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Dublim shqip' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => {
      expect(requests(fetchMock).at(-1)).toEqual({
        location: 'prizren',
        date: days[1],
        format: '3D',
        language: 'DUBBED_SQ',
      });
    });
  });

  it('falls back to today for an outdated date in the URL', async () => {
    const fetchMock = stubCatalog({ showtimes: (url) => showtimesAnswer(url) });
    renderApp('/schedule?date=2020-01-01');
    await screen.findByRole('article');
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
    expect(requests(fetchMock)).toEqual([{ location: 'prizren', date: days[0] }]);
  });

  it('shows an empty state with "clear filters" when filters match nothing', async () => {
    stubCatalog({ showtimes: (url) => showtimesAnswer(url, { empty: true }) });
    const { router } = renderApp('/schedule?format=3D');
    expect(await screen.findByText('Nuk ka shfaqje për këto filtra')).toBeInTheDocument();
    const clear = screen.getAllByRole('button', { name: 'Pastro filtrat' });
    fireEvent.click(clear.at(-1) as HTMLElement);
    expect(search(router)).toEqual({});
    expect(await screen.findByText('Nuk ka shfaqje për këtë ditë')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pastro filtrat' })).not.toBeInTheDocument();
  });

  it('shows loading, then an error with a working retry', async () => {
    let fail = true;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchMock = stubCatalog({ showtimes: (url) => showtimesAnswer(url) });
    const stubbed = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (urlOf(input).startsWith('/api/showtimes') && fail) {
        await gate;
        return new Response('{}', { status: 500 });
      }
      return stubbed ? stubbed(input) : Promise.reject(new Error('no stub'));
    });
    renderApp('/schedule');
    expect(await screen.findByText('Duke ngarkuar oraret…')).toBeInTheDocument();
    await act(async () => {
      release();
      await gate;
    });
    expect(await screen.findByText(/Oraret nuk u ngarkuan/)).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Provo përsëri' }));
    expect(await screen.findByRole('article')).toBeInTheDocument();
  });

  it('asks for a cinema first when none is chosen', async () => {
    window.localStorage.clear();
    window.sessionStorage.setItem(PICKER_DISMISSED_KEY, '1');
    const fetchMock = stubCatalog();
    renderApp('/schedule');
    const prompt = await screen.findByRole('heading', { level: 2, name: 'Zgjidh kinemanë' });
    fireEvent.click(
      within(prompt.parentElement as HTMLElement).getByRole('button', { name: 'Zgjidh kinemanë' }),
    );
    expect(await screen.findByRole('dialog', { name: 'Zgjidh kinemanë' })).toBeInTheDocument();
    expect(requests(fetchMock)).toEqual([]);
  });
});

describe('SchedulePage: filter sheet (phones)', () => {
  it('puts the day tabs above the filters and applies sheet changes only with "Apliko"', async () => {
    stubCatalog({ showtimes: (url) => showtimesAnswer(url) });
    const { router } = renderApp('/schedule?format=2D');
    const tablist = await screen.findByRole('tablist');
    const firstFilterGroup = screen.getAllByRole('group', { name: 'Filtrat' })[0] as HTMLElement;
    // Tabs come before the filters in the page order.
    expect(
      tablist.compareDocumentPosition(firstFilterGroup) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Filtrat (1)' }));
    const sheet = screen.getByRole('dialog', { name: 'Filtrat' });
    expect(within(sheet).getByRole('button', { name: '2D' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(within(sheet).getByRole('button', { name: '3D' }));
    // Nothing changes before "Apliko".
    expect(search(router)).toEqual({ format: '2D' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Apliko' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(search(router)).toEqual({ format: '2D,3D' });

    fireEvent.click(screen.getByRole('button', { name: 'Filtrat (2)' }));
    const again = screen.getByRole('dialog', { name: 'Filtrat' });
    fireEvent.click(within(again).getByRole('button', { name: 'Pastro' }));
    fireEvent.click(within(again).getByRole('button', { name: 'Apliko' }));
    expect(search(router)).toEqual({});

    // Escape closes without applying.
    fireEvent.click(screen.getByRole('button', { name: 'Filtrat' }));
    const third = screen.getByRole('dialog', { name: 'Filtrat' });
    fireEvent.click(within(third).getByRole('button', { name: 'Dublim shqip' }));
    fireEvent.keyDown(third, { key: 'Escape' });
    expect(search(router)).toEqual({});
  });
});
