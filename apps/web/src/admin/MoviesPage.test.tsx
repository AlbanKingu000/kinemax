import { fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminMovie, stubAdmin, superAdminUser } from '../test/admin';
import { renderApp } from '../test/catalog';
import { LOCATION_STORAGE_KEY } from '../location/location-storage';
import { slugify } from './slug';

// The panel is a lazy chunk: load it once, so the first test does not spend its wait on it.
beforeAll(async () => {
  await import('./AdminApp');
});

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
});

interface Req {
  method: string;
  path: string;
  url: URL;
  body: unknown;
}

const NEW_ID = '0190f0a0-0000-7000-8000-00000000d002';
const MOVIE_PATH = '/admin/movies/0190f0a0-0000-7000-8000-00000000d001';

/** A tiny in-memory movie API for the panel; `handle` may answer a request first. */
function stubMovies(handle?: (req: Req) => unknown) {
  const requests: Req[] = [];
  let movie = adminMovie();
  stubAdmin(superAdminUser(), (req) => {
    requests.push(req);
    const custom = handle?.(req);
    if (custom !== undefined) return custom;
    if (req.method === 'GET' && req.path === '/api/admin/movies') return { movies: [movie] };
    if (req.method === 'GET' && req.path === `/api/admin/movies/${movie.id}`) return { movie };
    if (req.method === 'PATCH') {
      movie = { ...movie, ...(req.body as object) };
      return { movie };
    }
    if (req.method === 'POST' && req.path === '/api/admin/movies') {
      movie = adminMovie({
        ...(req.body as object),
        id: NEW_ID,
        showtimeCount: 0,
        upcomingShowtimeCount: 0,
      });
      return { status: 201, body: { movie } };
    }
    return undefined;
  });
  return requests;
}

describe('the movies list', () => {
  it('shows the movies in a table and filters by search and status', async () => {
    const requests = stubMovies();
    renderApp('/admin/movies');
    const table = await screen.findByRole('table', { name: 'Filmat' });
    const row = within(table).getByRole('row', { name: /Fanari i Heshtur/ });
    expect(within(row).getByText('Në kinema')).toBeInTheDocument();
    expect(within(row).getByText('1 orë 52 min')).toBeInTheDocument();
    expect(
      within(row).getByRole('link', { name: 'Ndrysho filmin Fanari i Heshtur' }),
    ).toHaveAttribute('href', MOVIE_PATH);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Kërko' }), {
      target: { value: 'fan' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Statusi' }), {
      target: { value: 'ARCHIVED' },
    });
    await vi.waitFor(() => {
      const last = requests.filter((r) => r.path === '/api/admin/movies').at(-1);
      expect(last?.url.searchParams.get('q')).toBe('fan');
      expect(last?.url.searchParams.get('status')).toBe('ARCHIVED');
    });
  });
});

describe('the movie form', () => {
  it('checks the fields before sending, with an error summary', async () => {
    const requests = stubMovies();
    renderApp('/admin/movies/new');
    fireEvent.change(await screen.findByLabelText(/^Titulli \(shqip\)/), {
      target: { value: 'Drita e Veriut' },
    });
    expect(screen.getByLabelText(/^Adresa në faqe/)).toHaveValue('drita-e-veriut');
    fireEvent.change(screen.getByLabelText(/^ID e trailerit/), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Krijo filmin' }));
    const summary = await screen.findByRole('alert');
    expect(within(summary).getByRole('link', { name: /saktësisht 11 shenja/ })).toHaveAttribute(
      'href',
      '#movie-trailer',
    );
    // Every entry names its field, in the order of the form.
    expect(
      within(summary)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      'Përmbledhja (shqip): Plotëso këtë fushë.',
      'Kohëzgjatja (minuta): Nga 1 deri në 600 minuta.',
      'Data e premierës: Plotëso këtë fushë.',
      'Regjisori: Plotëso këtë fushë.',
      'ID e trailerit në YouTube: ID-ja duhet të ketë saktësisht 11 shenja (A-Z, a-z, 0-9, _ ose -).',
      'Zhanret: Zgjidh 1 deri në 5 zhanre.',
    ]);
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it('creates a movie and opens it for the images', async () => {
    const requests = stubMovies();
    const { router } = renderApp('/admin/movies/new');
    const fill = (label: RegExp, value: string) => {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    };
    await screen.findByLabelText(/^Titulli \(shqip\)/);
    fill(/^Titulli \(shqip\)/, 'Drita e Veriut');
    fill(/^Përmbledhja \(shqip\)/, 'Një udhëtim.');
    fill(/^Kohëzgjatja/, '118');
    fill(/^Data e premierës/, '2026-11-20');
    fill(/^Regjisori/, 'Regjisore Demo');
    fill(/^Aktorët/, 'Një\n\nDy ');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Dramë' }));
    fireEvent.click(screen.getByRole('button', { name: 'Krijo filmin' }));
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe(`/admin/movies/${NEW_ID}`);
    });
    expect(requests.find((r) => r.method === 'POST')?.body).toMatchObject({
      slug: 'drita-e-veriut',
      durationMinutes: 118,
      genres: ['DRAMA'],
      cast: ['Një', 'Dy'],
      trailerYoutubeId: null,
    });
    expect(
      await screen.findByText('Filmi u krijua. Tani mund të shtosh posterin.'),
    ).toBeInTheDocument();
  });

  it('shows a slug conflict from the server on its field', async () => {
    stubMovies((req) =>
      req.method === 'PATCH'
        ? { status: 409, body: { error: { code: 'conflict', message: 'x' } } }
        : undefined,
    );
    renderApp(MOVIE_PATH);
    fireEvent.click(await screen.findByRole('button', { name: 'Ruaj ndryshimet' }));
    expect(
      await screen.findAllByText('Kjo adresë (slug) përdoret nga një film tjetër.'),
    ).not.toHaveLength(0);
  });

  it('archives after a dialog that says what happens to the shows, and never offers delete', async () => {
    const requests = stubMovies();
    renderApp(MOVIE_PATH);
    expect(await screen.findByText(/Filmi ka 12 shfaqje, prandaj nuk fshihet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fshi filmin' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Arkivo filmin' }));
    const dialog = screen.getByRole('dialog', { name: 'Të arkivohet filmi?' });
    expect(within(dialog).getByText(/4 shfaqje të ardhshme mbeten aktive/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Anulo' })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Po, arkivoje' }));
    await vi.waitFor(() => {
      expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({ status: 'ARCHIVED' });
    });
    expect(await screen.findByText('Filmi u arkivua.')).toBeInTheDocument();
  });

  it('uploads a poster and explains a rejected file', async () => {
    let attempt = 0;
    const poster = '/api/media/0190f0a0-0000-7000-8000-0000000000e1.png';
    const requests = stubMovies((req) => {
      if (!req.path.endsWith('/images/poster')) return undefined;
      attempt += 1;
      if (attempt > 1) return { movie: adminMovie({ posterPath: poster }) };
      return {
        status: 422,
        body: {
          error: { code: 'unprocessable', message: 'x', fields: [{ path: 'file', code: 'type' }] },
        },
      };
    });
    renderApp(MOVIE_PATH);
    const input = await screen.findByLabelText('Zgjidh skedarin: Posteri');
    const file = new File(['<svg/>'], 'poster.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    const [upload] = screen.getAllByRole('button', { name: 'Ngarko' });
    if (!upload) throw new Error('no upload button');
    fireEvent.click(upload);
    expect(
      await screen.findByText('Lejohen vetëm JPEG, PNG ose WebP (SVG nuk lejohet).'),
    ).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(upload);
    expect(await screen.findByRole('img', { name: 'Posteri aktual' })).toHaveAttribute(
      'src',
      poster,
    );
    expect(requests.filter((r) => r.path.endsWith('/images/poster'))).toHaveLength(2);
  });
});

describe('slugify', () => {
  it('makes an address from an Albanian title', () => {
    expect(slugify('Drita e Veriut')).toBe('drita-e-veriut');
    expect(slugify('  Çka ndodhi në Ëndërr? ')).toBe('cka-ndodhi-ne-enderr');
  });
});
