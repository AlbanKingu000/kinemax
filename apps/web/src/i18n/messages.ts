// All UI text lives here. Albanian (sq) is the default; English (en) must have the same keys (the
// `Messages` type enforces it at compile time). Text that needs values is a small typed function.

export const locales = ['sq', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'sq';

/** Pages that are not built yet; each has its own title, description and text. */
export type ComingSoonPageKey =
  'movies' | 'movie' | 'schedule' | 'experiences' | 'locations' | 'food' | 'login';

const sq = {
  appName: 'Kinemax',
  common: {
    close: 'Mbyll',
    loading: 'Duke u ngarkuar…',
    optional: 'opsionale',
    remove: (label: string) => `Hiq ${label}`,
    language: 'Gjuha',
    retry: 'Provo përsëri',
    backHome: 'Kthehu në faqen kryesore',
  },
  toast: {
    region: 'Njoftimet',
    dismiss: 'Mbyll njoftimin',
  },
  meta: {
    titleSuffix: 'Kinemax',
    homeTitle: 'Kinemax · Kinema premium',
    homeDescription:
      'Kinemax: filmat që shfaqen tani dhe së shpejti në kinematë tona në Prishtinë, Prizren, Pejë dhe Ferizaj.',
  },
  nav: {
    skip: 'Kalo te përmbajtja',
    main: 'Navigimi kryesor',
    footer: 'Navigimi në fund të faqes',
    home: 'Kinemax, faqja kryesore',
    movies: 'Filmat',
    schedule: 'Orari',
    experiences: 'Përvojat',
    locations: 'Lokacionet',
    food: 'Ushqimi',
    login: 'Hyr',
    buyTicket: 'Bli biletë',
    openMenu: 'Hap menynë',
    menu: 'Menyja',
  },
  location: {
    choose: 'Zgjidh kinemanë',
    current: 'Kinemaja:',
    pickerIntro:
      'Zgjidh kinemanë tënde dhe të tregojmë filmat dhe oraret e saj. Mund ta ndryshosh kurdo.',
    selected: 'E zgjedhur',
    halls: 'Llojet e sallave',
    hallCount: (count: number) => (count === 1 ? '1 sallë' : `${count} salla`),
    loadError: 'Kinematë nuk u ngarkuan.',
  },
  movie: {
    duration: (minutes: number) => {
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      return hours > 0 ? `${hours} orë ${rest} min` : `${rest} min`;
    },
    ageRatings: {
      ALL: 'Për të gjitha moshat',
      AGE_7: 'Nga mosha 7 vjeç',
      AGE_12: 'Nga mosha 12 vjeç',
      AGE_15: 'Nga mosha 15 vjeç',
      AGE_18: 'Vetëm për të rriturit, 18 vjeç e lart',
    },
    languageVersions: {
      ORIGINAL_SQ_SUBTITLES: 'Titra shqip',
      DUBBED_SQ: 'Dublim shqip',
      ORIGINAL_NO_SUBTITLES: 'Pa titra',
    },
    genres: {
      ACTION: 'Aksion',
      ADVENTURE: 'Aventurë',
      ANIMATION: 'Animacion',
      COMEDY: 'Komedi',
      CRIME: 'Krim',
      DOCUMENTARY: 'Dokumentar',
      DRAMA: 'Dramë',
      FAMILY: 'Familjar',
      FANTASY: 'Fantazi',
      HISTORY: 'Histori',
      HORROR: 'Horror',
      MUSIC: 'Muzikë',
      MYSTERY: 'Mister',
      ROMANCE: 'Romancë',
      SCI_FI: 'Fantashkencë',
      THRILLER: 'Triller',
      WAR: 'Luftë',
    },
    formats: 'Formatet',
    releases: (date: string) => `Në kinema nga ${date}`,
    poster: (title: string) => `Posteri i filmit ${title}`,
  },
  home: {
    featured: 'Në qendër të vëmendjes',
    trailer: 'Trailer',
    trailerTitle: (title: string) => `Traileri: ${title}`,
    noFeaturedTitle: 'Kinemax',
    noFeaturedBody: 'Programi i ri po përgatitet. Shiko së shpejti filmat e radhës.',
    featuredError: 'Filmi kryesor nuk u ngarkua.',
    nowShowing: 'Tash në kinema',
    comingSoon: 'Së shpejti',
    allLocations: 'Në të gjitha kinematë',
    atLocation: (city: string) => `Në Kinemax ${city}`,
    loadingMovies: 'Duke ngarkuar filmat…',
    moviesError: 'Filmat nuk u ngarkuan. Kontrollo lidhjen dhe provo përsëri.',
    noMoviesTitle: 'Asnjë film për momentin',
    noMoviesBody: 'Në këtë kinema nuk ka shfaqje në dy javët e ardhshme.',
    noComingSoon: 'Së shpejti shtojmë filma të rinj.',
    changeLocation: 'Ndrysho kinemanë',
  },
  comingSoon: {
    badge: 'Së shpejti',
    pages: {
      movies: {
        title: 'Filmat',
        description: 'Të gjithë filmat e Kinemax-it, me detaje, trailerë dhe orare.',
        body: 'Katalogu i plotë i filmave po përgatitet.',
      },
      movie: {
        title: 'Filmi',
        description: 'Detajet e filmit, traileri dhe oraret në Kinemax.',
        body: 'Faqja e filmit me oraret dhe biletat vjen së shpejti.',
      },
      schedule: {
        title: 'Orari',
        description: 'Orari i shfaqjeve sipas kinemasë dhe ditës.',
        body: 'Orari sipas ditës, formatit dhe gjuhës vjen së shpejti.',
      },
      experiences: {
        title: 'Përvojat',
        description:
          'Sallat e Kinemax-it: Standard, VIP Recliner, Kinemax Grand dhe suitat private.',
        body: 'Prezantimi i sallave dhe përvojave tona vjen së shpejti.',
      },
      locations: {
        title: 'Lokacionet',
        description: 'Kinematë Kinemax në Prishtinë, Prizren, Pejë dhe Ferizaj.',
        body: 'Faqja me adresat, sallat dhe udhëzimet vjen së shpejti.',
      },
      food: {
        title: 'Ushqimi',
        description: 'Kokoshka, pije dhe menyja VIP, të porositura bashkë me biletat.',
        body: 'Menyja dhe porositë bashkë me biletat vijnë së shpejti.',
      },
      login: {
        title: 'Hyr',
        description: 'Hyr në llogarinë tënde Kinemax.',
        body: 'Hyrja dhe regjistrimi vijnë së shpejti.',
      },
    } satisfies Record<ComingSoonPageKey, { title: string; description: string; body: string }>,
  },
  footer: {
    locations: 'Kinematë',
    note: 'Projekt portfolio – Kinemax është kinema fiktive.',
    copyright: (year: number) => `© ${year} Kinemax`,
  },
  notFound: {
    title: 'Faqja nuk u gjet',
    body: 'Kjo faqe nuk ekziston ose është zhvendosur.',
    description: 'Faqja nuk u gjet.',
    backHome: 'Kthehu në faqen kryesore',
  },
};

export type Messages = typeof sq;

const en: Messages = {
  appName: 'Kinemax',
  common: {
    close: 'Close',
    loading: 'Loading…',
    optional: 'optional',
    remove: (label: string) => `Remove ${label}`,
    language: 'Language',
    retry: 'Try again',
    backHome: 'Back to the home page',
  },
  toast: {
    region: 'Notifications',
    dismiss: 'Dismiss notification',
  },
  meta: {
    titleSuffix: 'Kinemax',
    homeTitle: 'Kinemax · Premium cinema',
    homeDescription:
      'Kinemax: now showing and coming soon at our cinemas in Prishtinë, Prizren, Pejë and Ferizaj.',
  },
  nav: {
    skip: 'Skip to content',
    main: 'Main navigation',
    footer: 'Footer navigation',
    home: 'Kinemax, home page',
    movies: 'Movies',
    schedule: 'Schedule',
    experiences: 'Experiences',
    locations: 'Locations',
    food: 'Food',
    login: 'Sign in',
    buyTicket: 'Buy tickets',
    openMenu: 'Open menu',
    menu: 'Menu',
  },
  location: {
    choose: 'Choose your cinema',
    current: 'Cinema:',
    pickerIntro:
      'Choose your cinema and we show you its movies and showtimes. You can change it any time.',
    selected: 'Selected',
    halls: 'Hall types',
    hallCount: (count: number) => (count === 1 ? '1 hall' : `${count} halls`),
    loadError: 'The cinemas could not be loaded.',
  },
  movie: {
    duration: (minutes: number) => {
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      return hours > 0 ? `${hours} h ${rest} min` : `${rest} min`;
    },
    ageRatings: {
      ALL: 'Suitable for all ages',
      AGE_7: 'Ages 7 and over',
      AGE_12: 'Ages 12 and over',
      AGE_15: 'Ages 15 and over',
      AGE_18: 'Adults only, 18 and over',
    },
    languageVersions: {
      ORIGINAL_SQ_SUBTITLES: 'Albanian subtitles',
      DUBBED_SQ: 'Albanian dub',
      ORIGINAL_NO_SUBTITLES: 'No subtitles',
    },
    genres: {
      ACTION: 'Action',
      ADVENTURE: 'Adventure',
      ANIMATION: 'Animation',
      COMEDY: 'Comedy',
      CRIME: 'Crime',
      DOCUMENTARY: 'Documentary',
      DRAMA: 'Drama',
      FAMILY: 'Family',
      FANTASY: 'Fantasy',
      HISTORY: 'History',
      HORROR: 'Horror',
      MUSIC: 'Music',
      MYSTERY: 'Mystery',
      ROMANCE: 'Romance',
      SCI_FI: 'Sci-fi',
      THRILLER: 'Thriller',
      WAR: 'War',
    },
    formats: 'Formats',
    releases: (date: string) => `In cinemas from ${date}`,
    poster: (title: string) => `Poster of ${title}`,
  },
  home: {
    featured: 'In the spotlight',
    trailer: 'Trailer',
    trailerTitle: (title: string) => `Trailer: ${title}`,
    noFeaturedTitle: 'Kinemax',
    noFeaturedBody: 'A new programme is on its way. Check back soon for the next films.',
    featuredError: 'The featured movie could not be loaded.',
    nowShowing: 'Now showing',
    comingSoon: 'Coming soon',
    allLocations: 'At all our cinemas',
    atLocation: (city: string) => `At Kinemax ${city}`,
    loadingMovies: 'Loading movies…',
    moviesError: 'The movies could not be loaded. Check your connection and try again.',
    noMoviesTitle: 'No movies right now',
    noMoviesBody: 'There are no showtimes at this cinema in the next two weeks.',
    noComingSoon: 'New movies will be added soon.',
    changeLocation: 'Change cinema',
  },
  comingSoon: {
    badge: 'Coming soon',
    pages: {
      movies: {
        title: 'Movies',
        description: 'All Kinemax movies with details, trailers and showtimes.',
        body: 'The full movie catalogue is being prepared.',
      },
      movie: {
        title: 'Movie',
        description: 'Movie details, trailer and showtimes at Kinemax.',
        body: 'The movie page with showtimes and tickets is coming soon.',
      },
      schedule: {
        title: 'Schedule',
        description: 'Showtimes by cinema and day.',
        body: 'The schedule by day, format and language is coming soon.',
      },
      experiences: {
        title: 'Experiences',
        description: 'Kinemax halls: Standard, VIP Recliner, Kinemax Grand and private suites.',
        body: 'An introduction to our halls and experiences is coming soon.',
      },
      locations: {
        title: 'Locations',
        description: 'Kinemax cinemas in Prishtinë, Prizren, Pejë and Ferizaj.',
        body: 'The page with addresses, halls and directions is coming soon.',
      },
      food: {
        title: 'Food',
        description: 'Popcorn, drinks and the VIP menu, ordered together with your tickets.',
        body: 'The menu and ordering with your tickets are coming soon.',
      },
      login: {
        title: 'Sign in',
        description: 'Sign in to your Kinemax account.',
        body: 'Signing in and registration are coming soon.',
      },
    },
  },
  footer: {
    locations: 'Cinemas',
    note: 'Portfolio project – Kinemax is a fictional cinema.',
    copyright: (year: number) => `© ${year} Kinemax`,
  },
  notFound: {
    title: 'Page not found',
    body: 'This page does not exist or has moved.',
    description: 'Page not found.',
    backHome: 'Back to the home page',
  },
};

export const messages: Record<Locale, Messages> = { sq, en };

/** The English text when there is one, otherwise the required Albanian text. */
export function pickText(locale: Locale, sqText: string, enText: string | null): string {
  return locale === 'en' && enText ? enText : sqText;
}

// Month names are ours: browsers do not reliably ship Albanian date data (Intl falls back to
// English for "sq"), and the same text in Node keeps tests and pages identical.
const MONTHS: Record<Locale, readonly string[]> = {
  sq: [
    'janar',
    'shkurt',
    'mars',
    'prill',
    'maj',
    'qershor',
    'korrik',
    'gusht',
    'shtator',
    'tetor',
    'nëntor',
    'dhjetor',
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
};

/** A date-only ISO string (YYYY-MM-DD) as "13 nëntor 2026" / "13 November 2026". */
export function formatReleaseDate(locale: Locale, isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return `${String(day)} ${MONTHS[locale][(month ?? 1) - 1] ?? ''} ${String(year)}`;
}
