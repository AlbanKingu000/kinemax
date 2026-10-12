import { expect, test } from '@playwright/test';

test('home page loads in Albanian with the site shell', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));

  await page.goto('/');

  await expect(page).toHaveTitle('Kinemax · Kinema premium');
  await expect(page.locator('html')).toHaveAttribute('lang', 'sq');
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText('Kinemax është kinema fiktive');

  expect(problems).toEqual([]);
});

test('the API health endpoint is served through the web origin', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok', db: 'up' });
  expect(response.headers()['x-powered-by']).toBeUndefined();
});

test('the styleguide is not part of the production build', async ({ page }) => {
  await page.goto('/styleguide');
  await expect(page.getByRole('heading', { level: 1, name: 'Faqja nuk u gjet' })).toBeVisible();
});

test('the brand fonts are self-hosted, preloaded and loaded', async ({ page, request }) => {
  const html = await (await request.get('/')).text();
  for (const font of ['cormorant-garamond-latin-wght-normal', 'manrope-latin-wght-normal']) {
    expect(html).toMatch(
      new RegExp(`<link rel="preload" href="/assets/${font}-[\\w-]+\\.woff2" as="font"`),
    );
  }

  const fontRequests: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'font') fontRequests.push(new URL(r.url()).host);
  });
  await page.goto('/');
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [
      document.fonts.check('500 16px "Cormorant Garamond Variable"', 'Ëç'),
      document.fonts.check('400 16px "Manrope Variable"', 'Ëç'),
    ];
  });
  expect(loaded).toEqual([true, true]);
  expect(new Set(fontRequests)).toEqual(new Set([new URL(page.url()).host]));
});

test('the favicons are served', async ({ request }) => {
  for (const [path, type] of [
    ['/favicon.svg', 'image/svg+xml'],
    ['/favicon-16.png', 'image/png'],
    ['/favicon-32.png', 'image/png'],
    ['/favicon-48.png', 'image/png'],
    ['/apple-touch-icon.png', 'image/png'],
  ] as const) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()['content-type'], path).toContain(type);
  }
});
