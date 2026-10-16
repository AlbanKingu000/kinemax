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
  dashboard: {
    title: 'Dashboard',
    scope: (name: string | null) => (name ? `Kinemaja: ${name}` : 'Të gjitha kinematë'),
    range: 'Periudha',
    ranges: { today: 'Sot', '7d': '7 ditë', '30d': '30 ditë' },
    loadError: 'Statistikat nuk u ngarkuan.',
    revenue: 'Të ardhurat',
    revenueSplit: (tickets: string, food: string) => `Bileta ${tickets} · Ushqim ${food}`,
    refunds: (amount: string) => `Rimbursime të zbritura: ${amount}`,
    ticketsSold: 'Bileta të shitura',
    occupancy: 'Mbushja e sallave',
    occupancyDetail: (sold: number, capacity: number) =>
      `${String(sold)} nga ${String(capacity)} ulëse`,
    seatDelivery: 'Porosi te ulësja sot',
    seatDeliveryDetail: 'Për shfaqjet e sotme',
    revenueChart: 'Të ardhurat sipas ditës',
    tickets: 'Bileta',
    food: 'Ushqim',
    total: 'Gjithsej',
    day: 'Dita',
    hallTypes: 'Shitjet sipas llojit të sallës',
    topMovies: 'Top 5 filmat',
    ticketCount: (n: number) => (n === 1 ? '1 biletë' : `${String(n)} bileta`),
    noSales: 'Asnjë shitje në këtë periudhë.',
    upcoming: 'Shfaqjet në 24 orët e ardhshme',
    noUpcoming: 'Asnjë shfaqje në 24 orët e ardhshme.',
    columns: {
      time: 'Ora',
      movie: 'Filmi',
      hall: 'Salla',
      cinema: 'Kinemaja',
      seats: 'Ulëse',
      fill: 'Mbushja',
    },
    fillOf: (movie: string, time: string) => `Mbushja: ${movie}, ${time}`,
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
  dashboard: {
    title: 'Dashboard',
    scope: (name: string | null) => (name ? `Cinema: ${name}` : 'All cinemas'),
    range: 'Period',
    ranges: { today: 'Today', '7d': '7 days', '30d': '30 days' },
    loadError: 'The statistics could not be loaded.',
    revenue: 'Revenue',
    revenueSplit: (tickets: string, food: string) => `Tickets ${tickets} · Food ${food}`,
    refunds: (amount: string) => `Refunds subtracted: ${amount}`,
    ticketsSold: 'Tickets sold',
    occupancy: 'Hall occupancy',
    occupancyDetail: (sold: number, capacity: number) =>
      `${String(sold)} of ${String(capacity)} seats`,
    seatDelivery: 'Seat deliveries today',
    seatDeliveryDetail: "For today's shows",
    revenueChart: 'Revenue by day',
    tickets: 'Tickets',
    food: 'Food',
    total: 'Total',
    day: 'Day',
    hallTypes: 'Sales by hall type',
    topMovies: 'Top 5 movies',
    ticketCount: (n: number) => (n === 1 ? '1 ticket' : `${String(n)} tickets`),
    noSales: 'No sales in this period.',
    upcoming: 'Shows in the next 24 hours',
    noUpcoming: 'No shows in the next 24 hours.',
    columns: {
      time: 'Time',
      movie: 'Movie',
      hall: 'Hall',
      cinema: 'Cinema',
      seats: 'Seats',
      fill: 'Fill',
    },
    fillOf: (movie: string, time: string) => `Fill: ${movie}, ${time}`,
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
