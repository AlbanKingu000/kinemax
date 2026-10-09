import { expect, test } from '@playwright/test';

test('home page loads and shows a healthy API and database', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));

  await page.goto('/');

  await expect(page).toHaveTitle('Kinemax');
  await expect(page.locator('html')).toHaveAttribute('lang', 'sq');
  await expect(page.getByRole('heading', { level: 1, name: 'Kinemax' })).toBeVisible();

  const status = page.getByRole('status');
  await expect(status.getByRole('definition').first()).toHaveText('Në rregull');
  await expect(status.getByRole('definition').nth(1)).toHaveText('Në funksion');

  expect(problems).toEqual([]);
});

test('the API health endpoint is served through the web origin', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok', db: 'up' });
  expect(response.headers()['x-powered-by']).toBeUndefined();
});
