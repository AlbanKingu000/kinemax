/** Main sections, in menu order (header, drawer and footer). Paths are language-neutral. */
export const NAV_ITEMS = [
  { to: '/movies', key: 'movies' },
  { to: '/schedule', key: 'schedule' },
  { to: '/experiences', key: 'experiences' },
  { to: '/locations', key: 'locations' },
  { to: '/food', key: 'food' },
] as const;

/** "Buy tickets" goes to the schedule until the booking flow exists. */
export const BUY_TICKET_PATH = '/schedule';
