import { expect, test } from '@playwright/test';
import { expectNoAxe, watchConsole } from './booking-helpers.ts';
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
    if (isMobile) {
      await page.getByRole('button', { name: 'Hap menynë e administrimit' }).click();
    }
    const nav = page.getByRole('navigation', { name: 'Navigimi i administrimit' }).last();
    await expect(nav.getByRole('link', { name: 'Shfaqjet' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Filmat' })).toHaveCount(0);
    if (isMobile) await page.keyboard.press('Escape');
    await expectNoAxe(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => window.innerWidth),
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
