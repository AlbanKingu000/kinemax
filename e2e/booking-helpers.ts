// Helpers shared by the booking e2e specs (production build + the e2e catalog in kinemax_test).
import { AxeBuilder } from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

interface Showtimes {
  days: string[];
  movies: {
    movie: { ageRating: string };
    groups: { hallType: { code: string }; showtimes: { id: string }[] }[];
  }[];
}

/**
 * A bookable show in a hall of the given type at Prizren (today or later). `skip` picks a later
 * match, so projects running in parallel never hold the same seats; `adultsOnly` wants a 15+/18+
 * film; `exclude` skips shows other specs use.
 */
export async function findShowtime(
  request: APIRequestContext,
  hallType: string,
  {
    skip = 0,
    adultsOnly = false,
    exclude = [],
  }: { skip?: number; adultsOnly?: boolean; exclude?: string[] } = {},
): Promise<string> {
  const first = (await (await request.get('/api/showtimes?location=prizren')).json()) as Showtimes;
  let left = skip;
  for (const day of first.days) {
    const body = (await (
      await request.get(`/api/showtimes?location=prizren&date=${day}&hallType=${hallType}`)
    ).json()) as Showtimes;
    for (const { movie, groups } of body.movies) {
      if (adultsOnly && !['AGE_15', 'AGE_18'].includes(movie.ageRating)) continue;
      for (const show of groups.flatMap((g) => g.showtimes)) {
        if (exclude.includes(show.id)) continue;
        if (left === 0) return show.id;
        left -= 1;
      }
    }
  }
  throw new Error(`no ${hallType} show found`);
}

/** The 2D seat map (desktop opens in 3D, phones in 2D). */
export async function open2D(page: Page, isMobile: boolean) {
  // Pressed with the keyboard: on phones a click can land under the sticky header after the page
  // grows.
  if (!isMobile) {
    const toggle = page
      .getByRole('group', { name: 'Pamja e sallës' })
      .getByRole('button', { name: '2D' });
    await toggle.focus();
    await page.keyboard.press('Enter');
  }
  const map = page.getByRole('group', { name: /^Ulëset në / });
  await expect(map).toBeVisible();
  return map;
}

/** Picks the second seat of the first row with the keyboard; returns "Rreshti X, ulësja N". */
export async function pickSeat(page: Page, map: ReturnType<Page['getByRole']>) {
  await map.locator('button[tabindex="0"]').focus();
  await page.keyboard.press('ArrowRight');
  const focused = map.locator('button:focus');
  const label = (await focused.getAttribute('aria-label')) ?? '';
  expect(label).toMatch(/^Rreshti \w+, ulësja \d+, .*, e lirë, \d+,\d{2} €$/);
  await page.keyboard.press('Enter');
  await expect(focused).toHaveAttribute('aria-pressed', 'true');
  return label.split(', ').slice(0, 2).join(', ');
}

/** Fills the login form the app redirected to and signs in. */
export async function signIn(page: Page, account: { email: string; password: string }) {
  await page.getByLabel(/^Email-i/).fill(account.email);
  await page.getByLabel(/^Fjalëkalimi/).fill(account.password);
  await page.getByRole('button', { name: 'Hyr', exact: true }).click();
}

/** Console errors and warnings of the app (not Chromium's own WebGL driver diagnostics). */
export function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => {
    // Headless Chromium renders WebGL in software and reports GL driver diagnostics ("GPU stall
    // due to ReadPixels"): messages of the browser, not of the app.
    const browserGl = m.text().includes('GL Driver Message');
    if ((m.type() === 'error' || m.type() === 'warning') && !browserGl) problems.push(m.text());
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

export async function expectNoAxe(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .setLegacyMode()
    .analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}
