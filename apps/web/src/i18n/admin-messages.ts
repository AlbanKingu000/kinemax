// Text of the admin panel (/admin), kept apart from messages.ts so it ships in the admin chunk
// only. Same rules: Albanian first, English must have the same keys.
import type { Locale } from './messages';
import { useLocale } from './use-messages';

const sq = {
  meta: { title: 'Paneli i administrimit' },
  shell: {
    skip: 'Kalo te përmbajtja',
    nav: 'Navigimi i administrimit',
    openNav: 'Hap menynë e administrimit',
    navTitle: 'Administrimi',
    backToSite: 'Kthehu te site-i',
    later: 'Së shpejti',
    location: 'Kinemaja',
    allLocations: 'Të gjitha',
    userMenu: (name: string) => `Menyja e llogarisë: ${name}`,
    myAccount: 'Llogaria ime',
    logout: 'Dil',
    roles: { SUPER_ADMIN: 'Super administrator', LOCATION_MANAGER: 'Menaxher kinemaje' },
    loadError: 'Paneli nuk u ngarkua.',
  },
  nav: {
    dashboard: 'Dashboard',
    movies: 'Filmat',
    showtimes: 'Shfaqjet',
    halls: 'Sallat',
    prices: 'Çmimet',
    food: 'Ushqimi',
    scan: 'Skano',
    users: 'Përdoruesit',
  },
  placeholder: {
    title: (section: string) => `${section}: në ndërtim`,
    body: 'Kjo pjesë e panelit vjen së shpejti.',
  },
  notFound: {
    title: 'Faqja nuk u gjet',
    body: 'Kjo faqe e panelit nuk ekziston.',
    back: 'Te dashboard-i',
  },
};

export type AdminMessages = typeof sq;

const en: AdminMessages = {
  meta: { title: 'Admin panel' },
  shell: {
    skip: 'Skip to content',
    nav: 'Admin navigation',
    openNav: 'Open the admin menu',
    navTitle: 'Administration',
    backToSite: 'Back to the site',
    later: 'Coming soon',
    location: 'Cinema',
    allLocations: 'All',
    userMenu: (name: string) => `Account menu: ${name}`,
    myAccount: 'My account',
    logout: 'Sign out',
    roles: { SUPER_ADMIN: 'Super admin', LOCATION_MANAGER: 'Cinema manager' },
    loadError: 'The panel could not be loaded.',
  },
  nav: {
    dashboard: 'Dashboard',
    movies: 'Movies',
    showtimes: 'Showtimes',
    halls: 'Halls',
    prices: 'Prices',
    food: 'Food',
    scan: 'Scan',
    users: 'Users',
  },
  placeholder: {
    title: (section: string) => `${section}: under construction`,
    body: 'This part of the panel is coming soon.',
  },
  notFound: {
    title: 'Page not found',
    body: 'This admin page does not exist.',
    back: 'To the dashboard',
  },
};

export const adminMessages: Record<Locale, AdminMessages> = { sq, en };

/** Admin text in the current UI language. */
export function useAdminMessages(): AdminMessages {
  return adminMessages[useLocale().locale];
}
