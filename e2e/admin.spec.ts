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
