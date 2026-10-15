import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { e2eAccount } from '../apps/api/scripts/e2e-account.ts';
import {
  expectNoAxe,
  findShowtime,
  open2D,
  pickSeat,
  signIn,
  watchConsole,
} from './booking-helpers.ts';

// The checkout after the seats: food & drinks (then demo payment, confirmation, my tickets).
// Every journey holds seats with the project's own checkout account (one hold per user), so the
// journeys of a project run one after the other, and each one books its own show.

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('kinemax.location', 'prizren');
  });
});

/** Shows the other booking specs use (booking.spec, booking-hold.spec), never picked here. */
async function othersShows(request: APIRequestContext) {
  const first = await findShowtime(request, 'STANDARD');
  return [
    first,
    ...(await Promise.all(
      [0, 1].map((skip) =>
        findShowtime(request, 'STANDARD', { adultsOnly: true, skip, exclude: [first] }),
      ),
    )),
  ];
}

/** Signs in, picks a seat in 2D and goes through the tickets step to the food step. */
async function toFoodStep(page: Page, id: string, isMobile: boolean) {
  await page.goto('/login');
  await signIn(page, e2eAccount(test.info().project.name, 'checkout'));
  await expect(page).toHaveURL(/\/$/);
  await page.goto(`/booking/${id}`);
  await pickSeat(page, await open2D(page, isMobile));
  await page.getByRole('complementary').getByRole('button', { name: 'Vazhdo' }).click();
  await expect(page).toHaveURL(new RegExp(`/booking/${id}/tickets$`));
  const tickets = page.getByRole('region', { name: 'Biletat' });
  // The hold is loaded once the countdown runs.
  await expect(tickets.getByRole('timer')).toBeVisible();
  const age = tickets.getByRole('checkbox', { name: /^Konfirmoj që të gjithë shikuesit/ });
  if (await age.isVisible()) await age.check();
  await tickets.getByRole('button', { name: 'Vazhdo' }).click();
  await expect(page).toHaveURL(new RegExp(`/booking/${id}/food$`));
  return page.getByRole('region', { name: 'Ushqimi & pijet' });
}

/** What the checkout keeps on the hold (GET /api/bookings/current). */
interface Hold {
  food: { nameSq: string; quantity: number; fulfillment: string; serveTiming: string | null }[];
  ticketsCents: number;
  foodCents: number;
  totalCents: number;
}

async function currentHold(page: Page): Promise<Hold> {
  const body = (await (await page.request.get('/api/bookings/current')).json()) as {
    booking: Hold | null;
  };
  if (!body.booking) throw new Error('no hold');
  return body.booking;
}

test('food in a VIP hall: a combo brought to the seat during the film', async ({
  page,
  request,
  isMobile,
}) => {
  // A login, four page loads and an axe scan.
  test.setTimeout(60_000);
  const problems = watchConsole(page);
  const id = await findShowtime(request, 'VIP_RECLINER', { skip: isMobile ? 1 : 0 });
  const food = await toFoodStep(page, id, isMobile);
  await expect(food.getByRole('timer')).toHaveText(/^(10:00|0\d:\d\d)$/);
  await expect(food.getByRole('button', { name: 'Kalo këtë hap' })).toBeVisible();

  await food.getByRole('radio', { name: 'Na e sjellim te ulësja' }).check();
  await food.getByRole('radio', { name: 'Gjatë filmit (rreth 20 min pas fillimit)' }).check();
  await food.getByRole('tab', { name: 'Kombo' }).click();
  await food.getByRole('button', { name: 'Më shumë: Kombo klasike' }).click();
  const order = food.getByRole('complementary', { name: 'Porosia jote' });
  await expect(order.getByText('1 × Kombo klasike')).toBeVisible();
  await expect(
    order.getByText('Na e sjellim te ulësja · Gjatë filmit (rreth 20 min pas fillimit)'),
  ).toBeVisible();

  // Saved on the server, at the cinema's price, in the booking total.
  const booking = await currentHold(page);
  expect(booking.food).toEqual([
    expect.objectContaining({
      nameSq: 'Kombo klasike',
      quantity: 1,
      fulfillment: 'DELIVER_TO_SEAT',
      serveTiming: 'DURING_SHOW',
    }),
  ]);
  expect(booking.totalCents).toBe(booking.ticketsCents + booking.foodCents);
  expect(booking.foodCents).toBeGreaterThan(0);
  await expectNoAxe(page);

  await food.getByRole('button', { name: 'Vazhdo' }).click();
  await expect(food.getByText('Pagesa demo vjen së shpejti.')).toBeVisible();
  expect(problems).toEqual([]);
});

test('food in a Standard hall: no seat delivery, and the step can be skipped', async ({
  page,
  request,
  isMobile,
}) => {
  test.setTimeout(60_000);
  const problems = watchConsole(page);
  const id = await findShowtime(request, 'STANDARD', {
    skip: isMobile ? 1 : 0,
    exclude: await othersShows(request),
  });
  const food = await toFoodStep(page, id, isMobile);
  await expect(food.getByRole('tablist', { name: 'Kategoritë e menysë' })).toBeVisible();
  // Counter pickup only in this hall.
  await expect(food.getByRole('radio', { name: 'Na e sjellim te ulësja' })).toHaveCount(0);
  await food.getByRole('button', { name: 'Më shumë: Kokoshka mesatare' }).click();
  const order = food.getByRole('complementary', { name: 'Porosia jote' });
  await expect(order.getByText('1 × Kokoshka mesatare', { exact: true })).toBeVisible();

  await food.getByRole('button', { name: 'Kalo këtë hap' }).click();
  await expect(food.getByText('Pagesa demo vjen së shpejti.')).toBeVisible();
  await expect(order.getByText('Ende nuk ke zgjedhur asgjë.')).toBeVisible();
  expect((await currentHold(page)).food).toEqual([]);
  expect(problems).toEqual([]);
});
