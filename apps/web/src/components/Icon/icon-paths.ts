// Stroke icons drawn on a 24 x 24 grid (1.5 px strokes, round caps). Kinemax's own simple set.
const circle = 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z';

export const ICON_PATHS = {
  play: 'M8.5 5.75v12.5L18.5 12z',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  chevronDown: 'M6 9.5l6 6 6-6',
  chevronLeft: 'M14.5 6l-6 6 6 6',
  chevronRight: 'M9.5 6l6 6-6 6',
  arrowRight: 'M4.5 12h15M13.5 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.25 15.25L20 20',
  menu: 'M4 7h16M4 12h16M4 17h16',
  calendar: 'M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4',
  clock: `${circle}M12 7.5V12l3 2`,
  mapPin:
    'M12 20.5s6.5-5.5 6.5-10.75a6.5 6.5 0 0 0-13 0C5.5 15 12 20.5 12 20.5zM12 12a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5z',
  ticket:
    'M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4zM14.5 6.5v2M14.5 11v2M14.5 15.5v2',
  wheelchair:
    'M10.5 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM10.5 8v5h5l2.5 5M10.5 10h4.5M7.5 11a5 5 0 1 0 7 6.5',
  seat: 'M7 11V6.5A1.5 1.5 0 0 1 8.5 5h7A1.5 1.5 0 0 1 17 6.5V11M5 11h14v5H5zM7 16v3M17 16v3',
  film: 'M4.5 5h15v14h-15zM8.5 5v14M15.5 5v14M4.5 9h4M4.5 15h4M15.5 9h4M15.5 15h4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff:
    'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 4l16 16',
  logout: 'M14 4.5h4.5v15H14M10 8l-4 4 4 4M6 12h10.5',
  globe: `${circle}M3.5 12h17M12 3.5c2.25 2.4 3.4 5.25 3.4 8.5s-1.15 6.1-3.4 8.5c-2.25-2.4-3.4-5.25-3.4-8.5S9.75 5.9 12 3.5z`,
  info: `${circle}M12 11v5M12 8h.01`,
  warning: 'M12 4.25L20.5 19H3.5zM12 10v4M12 16.75h.01',
  success: `${circle}M8.5 12.25l2.5 2.5 4.75-5`,
  error: `${circle}M9.25 9.25l5.5 5.5M14.75 9.25l-5.5 5.5`,
} as const;

export type IconName = keyof typeof ICON_PATHS;
export const ICON_NAMES = Object.keys(ICON_PATHS) as IconName[];
