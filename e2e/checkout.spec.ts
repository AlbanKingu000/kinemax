import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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

/**
 * Journeys that start signed in: one login per project (through the API, kept as storage state)
 * instead of one per journey, so the whole e2e run stays under the login rate limit (20 per IP
 * per 15 minutes). The full journey below signs in through the page itself.
 */
const signedIn = test.extend<object, { checkoutState: string }>({
  checkoutState: [
    async ({ playwright }, use, info) => {
      const baseURL = info.project.use.baseURL ?? '';
      const file = join(info.project.outputDir, `checkout-session-${info.project.name}.json`);
      const api = await playwright.request.newContext({ baseURL });
      const csrf = (await (await api.get('/api/auth/csrf')).json()) as { csrfToken: string };
      const { email, password } = e2eAccount(info.project.name, 'checkout');
      const login = await api.post('/api/auth/login', {
        headers: { Origin: baseURL, 'X-CSRF-Token': csrf.csrfToken },
        data: { email, password },
      });
      expect(login.status()).toBe(200);
      await api.storageState({ path: file });
      await api.dispose();
      await use(file);
    },
    { scope: 'worker' },
  ],
  storageState: async ({ checkoutState }, use) => {
    await use(checkoutState);
  },
});

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

/** Signed in: picks a seat in 2D and goes through the tickets step to the food step. */
async function toFoodStep(page: Page, id: string, isMobile: boolean) {
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

signedIn(
  'food in a VIP hall: a combo brought to the seat during the film',
  async ({ page, request, isMobile }) => {
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
    await expect(page).toHaveURL(new RegExp(`/booking/${id}/pay$`));
    expect(problems).toEqual([]);
  },
);

signedIn(
  'food in a Standard hall: no seat delivery, and the step can be skipped',
  async ({ page, request, isMobile }) => {
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
    await expect(page).toHaveURL(new RegExp(`/booking/${id}/pay$`));
    expect((await currentHold(page)).food).toEqual([]);
    expect(problems).toEqual([]);
  },
);

/** The demo payment step: clearly a demo, nothing to type. */
async function expectDemoPayment(page: Page) {
  const pay = page.getByRole('region', { name: 'Pagesa' });
  await expect(pay.getByText('DEMO – nuk kryhet asnjë pagesë reale')).toBeVisible();
  await expect(pay.getByRole('img', { name: 'Karta demo 4242 •••• •••• 4242' })).toBeVisible();
  await expect(pay.locator('input, textarea, select')).toHaveCount(0);
  await expect(pay.getByRole('button', { name: /^Paguaj \(demo\) · \d+,\d{2} €$/ })).toBeEnabled();
  return pay;
}

// Declared with `signedIn` too: tests with other worker fixtures get a worker of their own and would
// run beside the serial ones, holding seats as the same user. It signs in through the page.
signedIn(
  'the whole journey: home → movie → time → seat → login → tickets → food → pay → QR ticket',
  async ({ page, isMobile }) => {
    // Eight page loads, an argon2 login, two axe scans.
    test.setTimeout(90_000);
    await page.context().clearCookies();
    const problems = watchConsole(page);
    await page.goto('/');
    const firstMovie = page.locator('#now-showing').getByRole('heading', { level: 3 }).first();
    const title = (await firstMovie.textContent()) ?? '';
    await firstMovie.getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    const showtimes = page.locator('section', {
      has: page.getByRole('heading', { level: 2, name: 'Oraret' }),
    });
    // Two days ahead: shows the other specs (which take the earliest ones) do not book.
    await showtimes
      .getByRole('tab')
      .nth(isMobile ? 3 : 2)
      .click();
    await showtimes
      .getByRole('link', { name: /^\d{2}:\d{2}, / })
      .first()
      .click();
    await expect(page).toHaveURL(/\/booking\/[0-9a-f-]{36}$/);

    // A seat further along the first row (not the one the other specs pick), by keyboard.
    const map = await open2D(page, isMobile);
    await map.locator('button[tabindex="0"]').focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.getByRole('complementary').getByRole('button', { name: 'Vazhdo' }).click();
    await signIn(page, e2eAccount(test.info().project.name, 'checkout'));
    await expect(page).toHaveURL(/\/booking\/[0-9a-f-]{36}$/);
    await page.getByRole('complementary').getByRole('button', { name: 'Vazhdo' }).click();

    const tickets = page.getByRole('region', { name: 'Biletat' });
    await expect(tickets.getByRole('timer')).toBeVisible();
    const age = tickets.getByRole('checkbox', { name: /^Konfirmoj që të gjithë shikuesit/ });
    if (await age.isVisible()) await age.check();
    await tickets.getByRole('button', { name: 'Vazhdo' }).click();

    const food = page.getByRole('region', { name: 'Ushqimi & pijet' });
    await food.getByRole('button', { name: 'Më shumë: Kokoshka mesatare' }).click();
    await expect(food.getByText('1 × Kokoshka mesatare', { exact: true })).toBeVisible();
    await food.getByRole('button', { name: 'Vazhdo' }).click();

    const pay = await expectDemoPayment(page);
    await expect(pay.getByText('1 × Kokoshka mesatare', { exact: true })).toBeVisible();
    await expectNoAxe(page);
    await pay.getByRole('button', { name: /^Paguaj \(demo\)/ }).click();

    await expect(page).toHaveURL(/\/booking\/[0-9a-f-]{36}\/confirmed$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Rezervimi u konfirmua' }),
    ).toBeVisible();
    const ticket = page.getByRole('article', { name: title });
    const qr = ticket.getByRole('img', { name: /^Kodi QR i biletës [0-9A-Z]{16}$/ });
    await expect(qr).toBeVisible();
    const code = ((await qr.getAttribute('aria-label')) ?? '').slice(-16);
    await expect(ticket.getByText(code.replace(/(.{4})(?=.)/g, '$1 '))).toBeVisible();
    await expect(ticket.getByText(/^1 × Kokoshka mesatare · Merre në banak$/)).toBeVisible();
    await expect(ticket.getByRole('link', { name: 'Biletat e mia' })).toBeVisible();

    // The ticket on the server: confirmed, paid, the QR encodes only the code.
    const bookingId = /\/booking\/([0-9a-f-]{36})\/confirmed$/.exec(page.url())?.[1] ?? '';
    const body = (await (await page.request.get(`/api/bookings/${bookingId}/ticket`)).json()) as {
      ticket: { code: string; status: string; payment: { status: string } };
    };
    expect([body.ticket.code, body.ticket.status, body.ticket.payment.status]).toEqual([
      code,
      'CONFIRMED',
      'SUCCEEDED',
    ]);

    // "Shto në kalendar": an .ics file with the show.
    const download = page.waitForEvent('download');
    await ticket.getByRole('button', { name: 'Shto në kalendar' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`kinemax-${code}.ics`);
    const ics = await readFile(await file.path(), 'utf8');
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toContain(`UID:${code}@kinemax`);
    expect(ics).toMatch(/\r\nDTSTART:\d{8}T\d{6}Z\r\n/);
    await expectNoAxe(page);
    expect(problems).toEqual([]);
  },
);

signedIn(
  'a declined demo payment keeps the hold; paying again confirms it',
  async ({ page, request, isMobile }) => {
    test.setTimeout(60_000);
    const problems = watchConsole(page);
    const id = await findShowtime(request, 'STANDARD', {
      skip: isMobile ? 3 : 2,
      exclude: await othersShows(request),
    });
    const food = await toFoodStep(page, id, isMobile);
    await food.getByRole('button', { name: 'Kalo këtë hap' }).click();
    const pay = await expectDemoPayment(page);

    await pay.getByRole('button', { name: 'Simulo refuzim' }).click();
    await expect(pay.getByText(/^Pagesa u refuzua \(demo\)/)).toBeVisible();
    // Still on hold, nothing confirmed.
    const hold = (await (await page.request.get('/api/bookings/current')).json()) as {
      booking: { status: string } | null;
    };
    expect(hold.booking?.status).toBe('HELD');

    await pay.getByRole('button', { name: /^Paguaj \(demo\)/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Rezervimi u konfirmua' }),
    ).toBeVisible();
    await expect(page.getByRole('img', { name: /^Kodi QR i biletës / })).toBeVisible();
    expect(problems).toEqual([]);
  },
);

signedIn(
  'my tickets: from the confirmation to "Biletat e mia", cancel with a refund, the seat is free again',
  async ({ page, request, isMobile }) => {
    test.setTimeout(90_000);
    const problems = watchConsole(page);
    // More than the 2-hour cancellation cutoff away, so the booking can still be cancelled.
    const id = await findShowtime(request, 'STANDARD', {
      skip: isMobile ? 5 : 4,
      exclude: await othersShows(request),
      leadMinutes: 180,
    });
    const food = await toFoodStep(page, id, isMobile);
    await food.getByRole('button', { name: 'Kalo këtë hap' }).click();
    const pay = await expectDemoPayment(page);
    await pay.getByRole('button', { name: /^Paguaj \(demo\)/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Rezervimi u konfirmua' }),
    ).toBeVisible();
    const qr = page.getByRole('img', { name: /^Kodi QR i biletës [0-9A-Z]{16}$/ });
    const code = ((await qr.getAttribute('aria-label')) ?? '').slice(-16);
    const seat =
      (await page
        .getByText(/^Rreshti \w+, ulësja \d+ · /)
        .first()
        .textContent()) ?? '';
    const [, row = '', number = ''] = /^Rreshti (\w+), ulësja (\d+)/.exec(seat) ?? [];

    // "Biletat e mia" from the ticket, and in the account menu.
    await page.getByRole('link', { name: 'Biletat e mia' }).click();
    await expect(page).toHaveURL(/\/account\/tickets$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Biletat e mia' })).toBeVisible();
    if (!isMobile) {
      await page.getByRole('button', { name: /^Llogaria e / }).click();
      await expect(page.getByRole('link', { name: 'Biletat e mia' }).first()).toBeVisible();
      await page.keyboard.press('Escape');
    }
    const upcoming = page.getByRole('tabpanel', { name: /^Të ardhshme/ });
    await expectNoAxe(page);
    await upcoming.locator(`a[href="/account/tickets/${code}"]`).click();

    // The ticket: a large QR, the brightness tip, then the cancellation with the refund first.
    await expect(page).toHaveURL(new RegExp(`/account/tickets/${code}$`));
    await expect(page.getByRole('img', { name: `Kodi QR i biletës ${code}` })).toBeVisible();
    await expect(
      page.getByText('Rrit ndriçimin e ekranit kur tregon kodin QR në hyrje.'),
    ).toBeVisible();
    await expect(page.getByText(/^Mund ta anulosh deri më /)).toBeVisible();
    await page.getByRole('button', { name: 'Anulo rezervimin' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ta anulojmë rezervimin?' });
    await expect(dialog.getByText(/^Do të rimbursohen \d+,\d{2} € \(demo\)/)).toBeVisible();
    await expectNoAxe(page);
    await dialog.getByRole('button', { name: 'Po, anuloje' }).click();
    await expect(page.getByText('Rezervimi u anulua dhe u rimbursua (demo).')).toBeVisible();
    await expect(page.getByRole('img', { name: /^Kodi QR/ })).toHaveCount(0);

    // Under "Të anuluara" now.
    await page.getByRole('link', { name: 'Të gjitha biletat' }).click();
    const tabs = page.getByRole('tablist', { name: 'Biletat sipas kohës' });
    await tabs.getByRole('tab', { name: /^Të anuluara/ }).click();
    const cancelled = page.getByRole('tabpanel', { name: /^Të anuluara/ });
    await expect(cancelled.locator(`a[href="/account/tickets/${code}"]`)).toBeVisible();
    await expect(cancelled.getByText('E rimbursuar').first()).toBeVisible();

    // The seat is free for everyone again.
    const map = (await (await request.get(`/api/showtimes/${id}/seatmap`)).json()) as {
      seats: { row: string; number: number; status: string }[];
    };
    expect(map.seats.find((s) => s.row === row && s.number === Number(number))?.status).toBe(
      'AVAILABLE',
    );
    expect(problems).toEqual([]);
  },
);
