// All UI text lives here. Albanian (sq) is the default; English (en) must have the same keys (the
// `Messages` type enforces it at compile time). Text that needs values is a small typed function.

export const locales = ['sq', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'sq';

const sq = {
  appName: 'Kinemax',
  common: {
    close: 'Mbyll',
    loading: 'Duke u ngarkuar…',
    optional: 'opsionale',
    remove: (label: string) => `Hiq ${label}`,
    language: 'Gjuha',
  },
  toast: {
    region: 'Njoftimet',
    dismiss: 'Mbyll njoftimin',
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
    formats: 'Formatet',
  },
  home: {
    statusHeading: 'Gjendja e sistemit',
    api: 'API',
    database: 'Baza e të dhënave',
    checking: 'Duke kontrolluar…',
    apiOk: 'Në rregull',
    apiError: 'Me probleme',
    dbUp: 'Në funksion',
    dbDown: 'Jashtë funksionit',
    unreachable: 'Nuk u arrit lidhja me API-në.',
  },
  notFound: {
    title: 'Faqja nuk u gjet',
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
  },
  toast: {
    region: 'Notifications',
    dismiss: 'Dismiss notification',
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
    formats: 'Formats',
  },
  home: {
    statusHeading: 'System status',
    api: 'API',
    database: 'Database',
    checking: 'Checking…',
    apiOk: 'OK',
    apiError: 'Having problems',
    dbUp: 'Up',
    dbDown: 'Down',
    unreachable: 'Could not reach the API.',
  },
  notFound: {
    title: 'Page not found',
    backHome: 'Back to the home page',
  },
};

export const messages: Record<Locale, Messages> = { sq, en };
