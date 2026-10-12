import type { ShowtimeDetailResponse } from '@kinemax/shared';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LOCATION_STORAGE_KEY } from '../location/location-storage';
import { renderApp, stubCatalog } from '../test/catalog';

const ID = '0190f0a0-0000-7000-8000-000000000042';
const show = (extra: Partial<ShowtimeDetailResponse['showtime']> = {}) => ({
  showtime: {
    id: ID,
    startsAt: '2026-03-28T23:15:00.000Z',
    endsAt: '2026-03-29T01:15:00.000Z',
    date: '2026-03-29',
    startTime: '00:15',
    endTime: '03:15',
    format: '3D',
    languageVersion: 'DUBBED_SQ',
    hasStarted: false,
    movie: {
      slug: 'kodi',
      titleSq: 'Kodi Orbital 9',
      titleEn: null,
      ageRating: 'AGE_12',
      durationMinutes: 131,
      genres: ['SCI_FI'],
      posterPath: '/seed/posters/kodi.svg',
    },
    location: {
      slug: 'prizren',
      name: 'Kinemax Prizren',
      city: 'Prizren',
      address: 'Rruga e Lumit 8, 20000 Prizren',
      timeZone: 'Europe/Belgrade',
    },
    hall: {
      name: 'VIP 3',
      wholeHallOnly: false,
      hallType: { code: 'VIP_RECLINER', nameSq: 'VIP Recliner', nameEn: null },
    },
    ...extra,
  },
});

beforeEach(() => {
  window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
});

describe('BookingPage', () => {
  it('summarises the show in the cinema time zone and announces seat selection', async () => {
    stubCatalog({ showtime: { [ID]: show() } });
    renderApp(`/booking/${ID}`);
    expect(await screen.findByText('Kodi Orbital 9')).toBeInTheDocument();
    const main = within(screen.getByRole('main'));
    expect(screen.getByRole('heading', { level: 1, name: 'Rezervimi' })).toBeInTheDocument();
    expect(main.getByText('Kinemax Prizren')).toBeInTheDocument();
    expect(screen.getByText('VIP 3')).toBeInTheDocument();
    expect(screen.getByText('VIP Recliner')).toBeInTheDocument();
    expect(screen.getByText('e diel, 29 mars 2026')).toBeInTheDocument();
    expect(screen.getByText('00:15–03:15')).toBeInTheDocument();
    expect(screen.getByText('3D')).toBeInTheDocument();
    expect(screen.getByText('Dublim shqip')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Zgjedhja e ulëseve vjen së shpejti' }),
    ).toBeInTheDocument();
    expect(document.title).toBe('Rezervimi · Kinemax');
  });

  it('explains a show that already started, with a way to other times', async () => {
    stubCatalog({ showtime: { [ID]: show({ hasStarted: true }) } });
    renderApp(`/booking/${ID}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kjo shfaqje ka filluar' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Orare të tjera' })).toHaveAttribute(
      'href',
      '/movies/kodi',
    );
  });

  it('shows a friendly error for unknown shows', async () => {
    stubCatalog();
    renderApp('/booking/not-a-real-id');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kjo shfaqje nuk u gjet' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Te orari' })).toHaveAttribute('href', '/schedule');
  });
});
