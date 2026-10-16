import { expect, test } from '@playwright/test';
import { expectNoAxe, watchConsole } from './booking-helpers.ts';
import { makePng } from '../apps/api/test/support/images.ts';
import { STAFF_STATE } from './admin-helpers.ts';

// The admin panel against the production build: who gets in, and what each role sees.

test('visitors get the ordinary not-found page at /admin', async ({ page }) => {
  const problems = watchConsole(page);
  await page.goto('/admin/showtimes');
  await expect(page.getByRole('heading', { level: 1, name: 'Faqja nuk u gjet' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navigimi i administrimit' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/showtimes$/);
  expect(problems).toEqual([]);
});

test.describe('a cinema manager', () => {
  test.use({ storageState: STAFF_STATE.manager });

  test('sees only their cinema and no movie management', async ({ page, isMobile }) => {
    const problems = watchConsole(page);
    await page.goto('/admin');
    const switcher = page.getByRole('combobox', { name: 'Kinemaja' });
    await expect(switcher).toBeVisible();
    await expect(switcher.getByRole('option')).toHaveText(['Kinemax Ferizaj']);
    // The dashboard of their cinema: key figures, the chart with its table, the next shows.
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Kinemaja: Kinemax Ferizaj')).toBeVisible();
    await expect(page.getByText('Bileta të shitura')).toBeVisible();
    await page.getByRole('button', { name: '7 ditë' }).click();
    await expect(page.getByRole('button', { name: '7 ditë' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Shfaq të dhënat si tabelë' }).click();
    await expect(
      page.getByRole('table', { name: 'Të ardhurat sipas ditës' }).getByRole('row'),
    ).toHaveCount(8);
    await expect(
      page
        .getByRole('table', { name: 'Shfaqjet në 24 orët e ardhshme' })
        .getByRole('meter')
        .first(),
    ).toBeVisible();
    if (isMobile) {
      await page.getByRole('button', { name: 'Hap menynë e administrimit' }).click();
    }
    const nav = page.getByRole('navigation', { name: 'Navigimi i administrimit' }).last();
    await expect(nav.getByRole('link', { name: 'Shfaqjet' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Filmat' })).toHaveCount(0);
    if (isMobile) await page.keyboard.press('Escape');
    await expectNoAxe(page);
    // Against the configured width: mobile emulation zooms out to fit a page that is too wide.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );

    await page.goto('/admin/movies');
    await expect(page.getByRole('heading', { level: 1, name: 'Faqja nuk u gjet' })).toBeVisible();
    // The API agrees: movies are the super admin's.
    expect((await page.request.get('/api/admin/locations')).status()).toBe(200);
    expect(problems).toEqual([]);
  });
});

test.describe('a cinema manager planning shows', () => {
  test.use({ storageState: STAFF_STATE.manager });

  test('creates a show, sees an overlap, deactivates it and adds a bulk plan', async ({
    page,
    isMobile,
  }) => {
    const problems = watchConsole(page);
    // Days after the seeded 14-day schedule, different per project (they run in parallel).
    const offset = isMobile ? 22 : 16;
    const date = (days: number) => {
      const d = new Date(Date.now() + days * 86_400_000);
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(d);
    };
    await page.goto(`/admin/showtimes?date=${date(offset)}`);
    const first = page
      .getByRole('region')
      .filter({ has: page.getByRole('heading', { level: 2 }) })
      .first();
    await expect(first.getByText('Asnjë shfaqje këtë ditë.')).toBeVisible();

    const create = async (time: string) => {
      await page.getByRole('button', { name: 'Shfaqje e re' }).click();
      const dialog = page.getByRole('dialog', { name: 'Shfaqje e re' });
      await dialog.getByLabel(/^Filmi/).selectOption({ index: 1 });
      await dialog.getByLabel(/^Ora e fillimit/).fill(time);
      await expect(dialog.getByText(/^Mbaron në/)).toBeVisible();
      await dialog.getByRole('button', { name: 'Krijo shfaqjen' }).click();
      return dialog;
    };
    await create('18:00');
    await expect(page.getByText('Shfaqja u krijua.')).toBeVisible();
    await expect(first.getByRole('row')).toHaveCount(2);
    const overlap = await create('18:30');
    await expect(overlap.getByRole('alert')).toContainText('Salla është e zënë');
    await overlap.getByRole('button', { name: 'Anulo' }).click();

    await first.getByRole('button', { name: /^Çaktivizo shfaqjen/ }).click();
    const confirm = page.getByRole('dialog', { name: 'Të çaktivizohet shfaqja?' });
    await expect(confirm.getByText('Nuk ka bileta të shitura.')).toBeVisible();
    await expectNoAxe(page);
    await confirm.getByRole('button', { name: 'Po, çaktivizoje' }).click();
    await expect(first.getByText('Joaktive')).toBeVisible();

    await page.getByRole('button', { name: 'Shto në grup' }).click();
    const bulk = page.getByRole('dialog', { name: 'Shto shfaqje në grup' });
    await bulk.getByLabel(/^Filmi/).selectOption({ index: 1 });
    await bulk.getByLabel(/^Nga data/).fill(date(offset + 1));
    await bulk.getByLabel(/^Deri më/).fill(date(offset + 2));
    await bulk.getByLabel(/^Oraret/).fill('12:00, 16:00');
    await bulk.getByRole('button', { name: 'Shiko paraprakisht' }).click();
    await expect(bulk.getByRole('table').getByText('Gati')).toHaveCount(4);
    await bulk.getByRole('button', { name: 'Krijo 4 shfaqje' }).click();
    await expect(page.getByText('U krijuan 4 shfaqje.')).toBeVisible();
    await page.getByRole('button', { name: 'Dita tjetër' }).click();
    await expect(first.getByRole('row')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );
    expect(problems.filter((p) => !p.includes('409'))).toEqual([]);
  });
});

test.describe('the super admin', () => {
  test.use({ storageState: STAFF_STATE.superAdmin });

  test('creates a movie, uploads a poster safely and deletes it again', async ({ page }, info) => {
    const problems = watchConsole(page);
    // Archived from the start, so the public pages other specs check never show it.
    const title = `Film E2E ${info.project.name} ${String(Date.now())}`;
    await page.goto('/admin/movies/new');
    await page.getByLabel(/^Titulli \(shqip\)/).fill(title);
    await page.getByLabel(/^Përmbledhja \(shqip\)/).fill('Një film për testet.');
    await page.getByLabel(/^Kohëzgjatja/).fill('95');
    await page.getByLabel(/^Data e premierës/).fill('2026-12-01');
    await page.getByLabel(/^Regjisori/).fill('Regjisor E2E');
    await page.getByLabel(/^Statusi/).selectOption({ label: 'Arkivuar' });
    await page.getByRole('checkbox', { name: 'Dramë' }).check();
    await page.getByRole('button', { name: 'Krijo filmin' }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

    const poster = page.getByLabel('Zgjidh skedarin: Posteri');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    await poster.setInputFiles({
      name: 'poster.png',
      mimeType: 'image/png',
      buffer: Buffer.from(svg),
    });
    await page.getByRole('button', { name: 'Ngarko' }).first().click();
    await expect(
      page.getByText('Lejohen vetëm JPEG, PNG ose WebP (SVG nuk lejohet).'),
    ).toBeVisible();
    await poster.setInputFiles({
      name: 'poster.png',
      mimeType: 'image/png',
      buffer: makePng(300, 450),
    });
    await page.getByRole('button', { name: 'Ngarko' }).first().click();
    const image = page.getByRole('img', { name: 'Posteri aktual' });
    await expect(image).toBeVisible();
    const src = (await image.getAttribute('src')) ?? '';
    expect(src).toMatch(/^\/api\/media\/[0-9a-f-]{36}\.png$/);
    const served = await page.request.get(src);
    expect(served.headers()['content-type']).toBe('image/png');
    expect(served.headers()['x-content-type-options']).toBe('nosniff');
    await expectNoAxe(page);

    await page.getByRole('button', { name: 'Fshi filmin' }).click();
    const dialog = page.getByRole('dialog', { name: 'Të fshihet filmi përgjithmonë?' });
    await dialog.getByRole('button', { name: 'Po, fshije' }).click();
    await expect(page).toHaveURL(/\/admin\/movies$/);
    await expect(page.getByRole('table', { name: 'Filmat' })).toBeVisible();
    // The wide table scrolls inside its frame, never the page.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );
    expect((await page.request.get(src)).status()).toBe(404);
    expect(problems.filter((p) => !p.includes('422'))).toEqual([]);
  });

  test('switches between all cinemas and goes back to the site', async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto('/admin');
    const switcher = page.getByRole('combobox', { name: 'Kinemaja' });
    await expect(switcher.getByRole('option')).toHaveCount(5);
    await expect(switcher).toHaveValue('');
    await switcher.selectOption({ label: 'Kinemax Prizren' });
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Kinemaja' })).not.toHaveValue('');
    await page.getByRole('link', { name: 'Kthehu te site-i' }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(problems).toEqual([]);
  });
});
