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

// Seat hold + "Biletat" step against the production build and the e2e catalog. Each project
// books another show with its own account (one hold per user), so they never meet.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('kinemax.location', 'prizren');
  });
});

test('select → Vazhdo → login → hold → categories → age confirmation → continue', async ({
  page,
  request,
  isMobile,
}) => {
  // Three page loads, an argon2 login and an axe scan.
  test.setTimeout(60_000);
  const problems = watchConsole(page);
  // Not the show booking.spec.ts picks seats in (same account, same seat otherwise).
  const id = await findShowtime(request, 'STANDARD', {
    adultsOnly: true,
    skip: isMobile ? 1 : 0,
    exclude: [await findShowtime(request, 'STANDARD')],
  });
  await page.goto(`/booking/${id}`);
  const seatText = await pickSeat(page, await open2D(page, isMobile));

  await page.getByRole('complementary').getByRole('button', { name: 'Vazhdo' }).click();
  await signIn(page, e2eAccount(test.info().project.name));
  await expect(page).toHaveURL(new RegExp(`/booking/${id}$`));
  await page.getByRole('complementary').getByRole('button', { name: 'Vazhdo' }).click();

  await expect(page).toHaveURL(new RegExp(`/booking/${id}/tickets$`));
  const step = page.getByRole('region', { name: 'Biletat' });
  await expect(step.getByRole('timer')).toHaveText(/^(10:00|09:\d\d)$/);
  await expect(step.getByText(seatText, { exact: false })).toBeVisible();

  // Prices come from the server: a student ticket costs less.
  const total = step.getByText('Totali', { exact: true }).locator('..').locator('strong');
  const adultTotal = await total.textContent();
  await step.getByLabel('Kategoria e biletës').selectOption('STUDENT');
  await expect(total).not.toHaveText(adultTotal ?? '');

  // 15+/18+: the age confirmation comes first.
  await step.getByRole('button', { name: 'Vazhdo' }).click();
  await expect(step.getByText('Konfirmo kufirin e moshës për të vazhduar.')).toBeVisible();
  await step.getByText('Konfirmoj që të gjithë shikuesit i plotësojnë kufirin e moshës').click();
  await expect(
    step.getByRole('checkbox', { name: /^Konfirmoj që të gjithë shikuesit/ }),
  ).toBeChecked();
  await expectNoAxe(page);
  await step.getByRole('button', { name: 'Vazhdo' }).click();
  // On to the optional food & drinks step (checkout.spec.ts covers it).
  await expect(page).toHaveURL(new RegExp(`/booking/${id}/food$`));
  await expect(page.getByRole('heading', { level: 2, name: 'Ushqimi & pijet' })).toBeVisible();

  // Coming back to the show resumes the hold.
  await page.goto(`/booking/${id}`);
  await expect(page).toHaveURL(new RegExp(`/booking/${id}/tickets$`));
  await expect(step.getByLabel('Kategoria e biletës')).toHaveValue('STUDENT');

  // "Ndrysho ulëset" releases the hold and keeps the seat chosen on the map.
  await step.getByRole('button', { name: 'Ndrysho ulëset' }).click();
  await expect(page).toHaveURL(new RegExp(`/booking/${id}$`));
  await expect(page.getByRole('complementary').getByText(seatText)).toBeVisible();
  expect(problems).toEqual([]);
});
