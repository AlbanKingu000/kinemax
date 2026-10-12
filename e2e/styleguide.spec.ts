import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEV_WEB_URL } from './ports.ts';

// /styleguide only exists in development builds, so these tests use the Vite dev server.
test.use({ baseURL: DEV_WEB_URL });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

async function expectNoAxeViolations(page: Page, include?: string) {
  // Legacy mode runs axe.run() in the page itself. The default mode opens an extra blank page per
  // scan for axe.finishRun(), and starting that renderer process alone sometimes takes ~4 s on
  // Windows, which pushed this spec past its timeout. Same rules and tags; the only difference is
  // that cross-origin iframes are not scanned, and the app has none.
  const builder = new AxeBuilder({ page }).withTags(WCAG_TAGS).setLegacyMode();
  if (include) builder.include(include);
  const { violations } = await builder.analyze();
  const summary = violations.map(
    (v) => `${v.id} (${v.impact ?? 'n/a'}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(summary).toEqual([]);
}

test('the styleguide has no axe violations in Albanian and English', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/styleguide');
  await expect(page.getByRole('heading', { level: 1, name: 'Udhëzuesi i stilit' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'sq');
  await expectNoAxeViolations(page);

  // The page header switch (the shell demos have their own).
  await page.getByRole('banner').getByRole('button', { name: 'EN (English)' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Style guide' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expectNoAxeViolations(page);

  // The choice is remembered.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Style guide' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  expect(problems).toEqual([]);
});

test('the dialog traps focus, passes axe and gives focus back', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/styleguide');
  const trigger = page.getByRole('button', { name: 'Hap dialogun' });
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Konfirmo rezervimin' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Mbyll' })).toBeFocused();
  await expectNoAxeViolations(page, '[role="dialog"]');

  // Shift+Tab from the first control wraps to the last one.
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Konfirmo' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Mbyll' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(problems).toEqual([]);
});

test('the hero canvas is drawn and fits the page width', async ({ page }) => {
  await page.goto('/styleguide');
  const canvas = page.locator('#hero canvas');
  await expect(canvas).toBeAttached();
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({
    width: element.width,
    cssWidth: element.clientWidth,
  }));
  expect(size.width).toBeGreaterThan(0);
  expect(size.width).toBeLessThanOrEqual(Math.ceil(size.cssWidth * 1.5));
  // No horizontal scrolling on any viewport.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the hero draws one still frame and does not animate', async ({ page }) => {
    await page.goto('/styleguide');
    await expect(page.locator('#hero canvas')).toBeAttached();
    const frames = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const canvas = document.querySelector<HTMLCanvasElement>('#hero canvas');
          const ctx = canvas?.getContext('2d');
          if (!canvas || !ctx) {
            resolve(-1);
            return;
          }
          const snapshot = () => canvas.toDataURL();
          const first = snapshot();
          setTimeout(() => {
            resolve(snapshot() === first ? 0 : 1);
          }, 600);
        }),
    );
    expect(frames).toBe(0);
  });
});
