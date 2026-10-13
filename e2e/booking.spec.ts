import { expect, test } from '@playwright/test';
import { e2eAccount } from '../apps/api/scripts/e2e-account.ts';
import {
  expectNoAxe,
  findShowtime,
  open2D,
  pickSeat,
  signIn,
  watchConsole,
} from './booking-helpers.ts';

// Seat selection against the production build and the e2e catalog (no bookings: every seat is
// free). Signs in with the project's fixed test account instead of registering.

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
  const problems = watchConsole(page);
  const id = await findShowtime(request, 'STANDARD');
  await page.goto(`/booking/${id}`);
  const map = await open2D(page, isMobile);
  await expectNoAxe(page);

  // One tab stop in the map; arrows move, Enter selects.
  const seatText = await pickSeat(page, map);
  const panel = page.getByRole('complementary');
  await expect(panel.getByText(seatText)).toBeVisible();

  await panel.getByRole('button', { name: 'Vazhdo' }).click();
  await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Fbooking%2F${id}$`));
  await signIn(page, e2eAccount(test.info().project.name));

  await expect(page).toHaveURL(new RegExp(`/booking/${id}$`));
  await expect(page.getByRole('complementary').getByText(seatText)).toBeVisible();
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
