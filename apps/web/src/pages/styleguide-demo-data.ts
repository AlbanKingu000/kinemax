// Sample catalog data for the /styleguide demos (development only). Fictional, like the seed.
import type { FeaturedMovie, LocationSummary, MovieSummary } from '@kinemax/shared';

const hallType = (code: string, nameSq: string, nameEn: string, hallCount: number) => ({
  code,
  nameSq,
  nameEn,
  hallCount,
});

export const DEMO_LOCATIONS: LocationSummary[] = [
  {
    slug: 'prishtine',
    name: 'Kinemax Prishtinë',
    city: 'Prishtinë',
    address: 'Bulevardi i Dritës 12, 10000 Prishtinë',
    timeZone: 'Europe/Belgrade',
    hallTypes: [
      hallType('STANDARD', 'Standard', 'Standard', 3),
      hallType('VIP_RECLINER', 'VIP Recliner', 'VIP Recliner', 1),
      hallType('PREMIUM_LARGE_FORMAT', 'Kinemax Grand', 'Kinemax Grand', 1),
    ],
  },
  {
    slug: 'prizren',
    name: 'Kinemax Prizren',
    city: 'Prizren',
    address: 'Rruga e Lumit 8, 20000 Prizren',
    timeZone: 'Europe/Belgrade',
    hallTypes: [
      hallType('STANDARD', 'Standard', 'Standard', 2),
      hallType('PRIVATE_SUITE', 'Suitë private', 'Private suite', 1),
    ],
  },
];

const movie = (
  slug: string,
  titleSq: string,
  titleEn: string,
  extra: Partial<MovieSummary>,
): MovieSummary => ({
  slug,
  titleSq,
  titleEn,
  synopsisSq: 'Një histori e trilluar për Kinemax.',
  synopsisEn: 'A fictional story for Kinemax.',
  ageRating: 'AGE_12',
  durationMinutes: 104,
  genres: ['DRAMA'],
  releaseDate: '2026-11-13',
  posterPath: `/seed/posters/${slug}.svg`,
  formats: [],
  languageVersions: [],
  ...extra,
});

export const DEMO_MOVIES: MovieSummary[] = [
  movie('levizja-e-fundit-e-gjyshit', 'Lëvizja e Fundit e Gjyshit', "Grandpa's Last Move", {
    ageRating: 'AGE_7',
    genres: ['COMEDY', 'FAMILY'],
    releaseDate: '2026-11-06',
  }),
  movie('agimi-mbi-uren-e-kuqe', 'Agimi mbi Urën e Kuqe', 'Dawn over the Red Bridge', {
    ageRating: 'AGE_15',
    genres: ['HISTORY', 'WAR'],
    releaseDate: '2026-11-20',
  }),
  movie('ritmi-i-rruges-2042', 'Ritmi i Rrugës 2042', 'Street Rhythm 2042', {
    genres: ['MUSIC', 'SCI_FI'],
    releaseDate: '2026-12-04',
  }),
];

export const DEMO_FEATURED: FeaturedMovie = {
  ...movie('kodi-orbital-9', 'Kodi Orbital 9', 'Orbital Code 9', {
    durationMinutes: 131,
    genres: ['SCI_FI', 'THRILLER'],
    releaseDate: '2026-09-30',
    synopsisSq:
      'Një inxhiniere softueri zbulon se satelitët e vjetër po i dërgojnë mesazhe njëri-tjetrit pa asnjë njeri në kontroll.',
    synopsisEn:
      'A software engineer discovers that old satellites are messaging each other with no human in control.',
    formats: ['2D', '3D'],
    languageVersions: ['ORIGINAL_SQ_SUBTITLES'],
  }),
  backdropPath: null,
  // No trailer in the demo: the button only appears with a real id (and loads YouTube on click).
  trailerYoutubeId: null,
};
