import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { E2E_ACCOUNT } from '../apps/api/scripts/e2e-account.ts';

// Seat selection against the production build and the e2e catalog (no bookings: every seat is
// free). Signs in with the fixed test account instead of registering.

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

interface Showtimes {
  days: string[];
  movies: { groups: { hallType: { code: string }; showtimes: { id: string }[] }[] }[];
}

/** A bookable show in a hall of the given type at Prizren (today, or a later day). */
async function findShowtime(request: APIRequestContext, hallType: string): Promise<string> {
  const first = (await (await request.get('/api/showtimes?location=prizren')).json()) as Showtimes;
  for (const day of first.days) {
    const body = (await (
      await request.get(`/api/showtimes?location=prizren&date=${day}&hallType=${hallType}`)
    ).json()) as Showtimes;
    const id = body.movies[0]?.groups[0]?.showtimes[0]?.id;
    if (id) return id;
  }
  throw new Error(`no ${hallType} show found`);
}

async function open2D(page: Page, isMobile: boolean) {
  // Desktop opens in 3D; phones open in 2D. Pressed with the keyboard: on phones a click can land
  // under the sticky header after the page grows.
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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('kinemax.location', 'prizren');
  });
});

test('keyboard pick in 2D → Vazhdo → login → back with the same seats', async ({
  page,
  request,
  isMobile,
}) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    // Headless Chromium renders WebGL in software and reports GL driver diagnostics ("GPU stall
    // due to ReadPixels"): messages of the browser, not of the app.
    const browserGl = m.text().includes('GL Driver Message');
    if ((m.type() === 'error' || m.type() === 'warning') && !browserGl) problems.push(m.text());
  });
  const id = await findShowtime(request, 'STANDARD');
  await page.goto(`/booking/${id}`);
  const map = await open2D(page, isMobile);
  await expectNoAxe(page);

  // One tab stop in the map; arrows move, Enter selects.
  const first = map.locator('button[tabindex="0"]');
  await first.focus();
  await page.keyboard.press('ArrowRight');
  const focused = map.locator('button:focus');
  const label = (await focused.getAttribute('aria-label')) ?? '';
  expect(label).toMatch(/^Rreshti \w+, ulësja \d+, .*, e lirë, \d+,\d{2} €$/);
  await page.keyboard.press('Enter');
  await expect(focused).toHaveAttribute('aria-pressed', 'true');
  const seatText = label.split(', ').slice(0, 2).join(', ');
  const panel = page.getByRole('complementary');
  await expect(panel.getByText(seatText)).toBeVisible();

  await panel.getByRole('button', { name: 'Vazhdo' }).click();
  await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Fbooking%2F${id}$`));
  await page.getByLabel(/^Email-i/).fill(E2E_ACCOUNT.email);
  await page.getByLabel(/^Fjalëkalimi/).fill(E2E_ACCOUNT.password);
  await page.getByRole('button', { name: 'Hyr', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/booking/${id}$`));
  await expect(page.getByRole('complementary').getByText(seatText)).toBeVisible();
  await page.getByRole('complementary').getByRole('button', { name: 'Vazhdo' }).click();
  await expect(page.getByText(/Hapi tjetër/)).toBeVisible();
  expect(problems).toEqual([]);
});

test('the 3D hall renders and "Shiko pamjen" opens the view from a seat', async ({
  page,
  request,
  isMobile,
}) => {
  const id = await findShowtime(request, 'STANDARD');
  await page.goto(`/booking/${id}`);
  if (isMobile) await page.getByRole('button', { name: 'Shiko sallën në 3D' }).click();
  const canvas = page.locator('canvas[data-draw-calls]');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-draw-calls')))
    .toBeGreaterThan(0);

  const map = await open2D(page, false);
  await map.locator('button[tabindex="0"]').focus();
  await page.getByRole('button', { name: /^Shiko pamjen nga Rreshti / }).click();
  const overlay = page.getByRole('dialog', { name: /^Rreshti \w+ · Ulësja \d+ · / });
  await expect(overlay).toBeVisible();
  await overlay.getByRole('button', { name: 'Zgjidh këtë ulëse' }).click();
  await expect(overlay.getByRole('button', { name: 'Hiqe' })).toBeVisible();
  await overlay.getByRole('button', { name: 'Kthehu te salla' }).click();
  await expect(overlay).toBeHidden();
  await expect(page.getByRole('button', { name: 'Rikthe pamjen' })).toBeVisible();
});

test('suites are booked as a whole', async ({ page, request }) => {
  const id = await findShowtime(request, 'PRIVATE_SUITE');
  await page.goto(`/booking/${id}`);
  const book = page.getByRole('button', { name: 'Rezervo gjithë suitën' });
  await book.click();
  await expect(page.getByRole('button', { name: 'Suita e zgjedhur' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('group', { name: /^Ulëset në / })).toHaveCount(0);
});

async function expectNoAxe(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .setLegacyMode()
    .analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}
