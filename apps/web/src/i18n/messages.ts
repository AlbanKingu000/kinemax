// All UI text lives here. Albanian (sq) is the default; English (en) must have the same keys.

export const locales = ['sq', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'sq';

const sq = {
  appName: 'Kinemax',
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
