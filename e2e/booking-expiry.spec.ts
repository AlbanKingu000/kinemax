import { execSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { e2eAccount } from '../apps/api/scripts/e2e-account.ts';
import { findShowtime, open2D, pickSeat, signIn, watchConsole } from './booking-helpers.ts';

// A hold that runs out. Runs in its own Playwright project after all others, because it shortens
// the hold time for the whole kinemax_test database (AppSettings, 1 minute) and restores it after.

const setHoldMinutes = (minutes: number) => {
  execSync(`npm run e2e:hold-minutes -w @kinemax/api -- ${String(minutes)}`, { stdio: 'inherit' });
};

test.beforeAll(() => {
  setHoldMinutes(1);
});

test.afterAll(() => {
  setHoldMinutes(10);
});

test('an expired hold ends the tickets step and frees the seats', async ({ page, request }) => {
  // The hold lasts one minute (the shortest the database allows).
  test.setTimeout(150_000);
  const problems = watchConsole(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('kinemax.location', 'prizren');
  });
  // A VIP hall: no other spec holds seats there.
  const id = await findShowtime(request, 'VIP_RECLINER');
  await page.goto(`/login?next=${encodeURIComponent(`/booking/${id}`)}`);
  await signIn(page, e2eAccount(test.info().project.name));
  await expect(page).toHaveURL(new RegExp(`/booking/${id}$`));
  const seatText = await pickSeat(page, await open2D(page, false));
  await page.getByRole('complementary').getByRole('button', { name: 'Vazhdo' }).click();

  const step = page.getByRole('region', { name: 'Biletat' });
  await expect(step.getByRole('timer')).toHaveText(/^(01:00|00:\d\d)$/);
  await expect(page.getByText('Ka mbetur 1 minutë për të përfunduar rezervimin.')).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Koha e rezervimit mbaroi' })).toBeVisible({
    timeout: 90_000,
  });

  // Back on the map the seat is free again and still chosen.
  await page.getByRole('button', { name: 'Kthehu te ulëset' }).click();
  await expect(page).toHaveURL(new RegExp(`/booking/${id}$`));
  const map = await open2D(page, false);
  await expect(
    map.getByRole('button', { name: new RegExp(`^${seatText}, .*, e zgjedhur`) }),
  ).toBeVisible();
  expect(problems).toEqual([]);
});
