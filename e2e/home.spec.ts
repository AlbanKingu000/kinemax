import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Home page, cinema picker, language switch and mobile drawer against the production build and the
// demo catalog in kinemax_test (apps/api/scripts/e2e-catalog.ts).

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

interface MovieSummary {
  slug: string;
  titleSq: string;
}

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

async function expectNoAxeViolations(page: Page) {
  // Legacy mode: see e2e/styleguide.spec.ts.
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .setLegacyMode()
    .analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

const picker = (page: Page) => page.getByRole('dialog', { name: 'Zgjidh kinemanë' });
const nowShowing = (page: Page) =>
  page.locator('section', { has: page.getByRole('heading', { level: 2, name: 'Tash në kinema' }) });

test('first visit: choose Prizren, see Prizren data, keep it after a reload', async ({
  page,
  request,
}) => {
  const problems = collectProblems(page);
  const featured = (await (await request.get('/api/featured?location=prizren')).json()) as {
    movie: MovieSummary;
  };
  const prizrenMovies = (
    (await (await request.get('/api/movies?status=NOW_SHOWING&location=prizren')).json()) as {
      movies: MovieSummary[];
    }
  ).movies;
  expect(prizrenMovies.length).toBeGreaterThan(0);

  await page.goto('/');
  const dialog = picker(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button')).toHaveCount(5); // 4 cinemas + close
  await expectNoAxeViolations(page);
  await dialog.getByRole('button', { name: /Prizren/ }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(featured.movie.titleSq);
  const section = nowShowing(page);
  await expect(section.getByText('Në Kinemax Prizren')).toBeVisible();
  await expect(section.getByRole('heading', { level: 3 })).toHaveText(
    prizrenMovies.map((m) => m.titleSq),
  );
  await expect(section.getByRole('link').first()).toHaveAttribute(
    'href',
    `/movies/${prizrenMovies[0]?.slug ?? ''}`,
  );
  // The seed has no trailers, so the hero shows no trailer button.
  await expect(page.getByRole('button', { name: 'Trailer' })).toHaveCount(0);
  await expectNoAxeViolations(page);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(featured.movie.titleSq);
  await expect(nowShowing(page).getByText('Në Kinemax Prizren')).toBeVisible();
  await expect(picker(page)).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('the picker can be closed without choosing: all cinemas', async ({ page }) => {
  await page.goto('/');
  await picker(page).getByRole('button', { name: 'Mbyll' }).click();
  await expect(nowShowing(page).getByText('Në të gjitha kinematë')).toBeVisible();
  await page.reload();
  await expect(nowShowing(page).getByText('Në të gjitha kinematë')).toBeVisible();
  await expect(picker(page)).toHaveCount(0);
});

test('the SQ/EN switch changes the texts and <html lang>', async ({ page, isMobile }) => {
  await page.goto('/');
  await picker(page)
    .getByRole('button', { name: /Prizren/ })
    .click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'sq');

  if (isMobile) {
    await page.getByRole('button', { name: 'Hap menynë' }).click();
    await page
      .getByRole('dialog', { name: 'Menyja' })
      .getByRole('button', { name: 'EN (English)' })
      .click();
    await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Close' }).click();
  } else {
    await page.getByRole('banner').getByRole('button', { name: 'EN (English)' }).click();
  }
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveTitle('Kinemax · Premium cinema');
  await expect(page.getByRole('heading', { level: 2, name: 'Now showing' })).toBeVisible();
  await expect(page.getByText('At Kinemax Prizren')).toBeVisible();
  await expect(page.getByText(/In cinemas from \d{1,2} [A-Z][a-z]+ \d{4}/).first()).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText('Kinemax is a fictional cinema.');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('the header turns solid when the page scrolls', async ({ page }) => {
  await page.goto('/');
  await picker(page)
    .getByRole('button', { name: /Prizren/ })
    .click();
  const header = page.getByRole('banner');
  await expect(header).toHaveAttribute('data-solid', 'false');
  await page.mouse.wheel(0, 800);
  await expect(header).toHaveAttribute('data-solid', 'true');
});

test('the mobile drawer works with the keyboard', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The drawer replaces the navigation below 1280px (mobile project).');
  const problems = collectProblems(page);
  await page.goto('/');
  await picker(page)
    .getByRole('button', { name: /Prizren/ })
    .click();

  const menuButton = page.getByRole('button', { name: 'Hap menynë' });
  await menuButton.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Menyja' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Mbyll' })).toBeFocused();
  await expectNoAxeViolations(page);

  // Shift+Tab from the first control wraps to the last one (focus stays in the drawer).
  await page.keyboard.press('Shift+Tab');
  await expect(drawer.getByRole('link', { name: 'Bli biletë' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(drawer.getByRole('button', { name: 'Mbyll' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(menuButton).toBeFocused();

  // Open it again and follow a link with the keyboard.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(drawer.getByRole('link', { name: 'Filmat' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/movies$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Filmat' })).toBeVisible();
  await expect(drawer).toBeHidden();
  expect(problems).toEqual([]);
});

test('the "Now showing" row scrolls sideways on phones and is a grid on desktop', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  await picker(page)
    .getByRole('button', { name: /Prizren/ })
    .click();
  const list = nowShowing(page).getByRole('list');
  await expect(list.getByRole('listitem').first()).toBeVisible();
  const overflow = await list.evaluate((el) => el.scrollWidth - el.clientWidth);
  if (isMobile) expect(overflow).toBeGreaterThan(0);
  else expect(overflow).toBeLessThanOrEqual(0);
  // The page itself never scrolls sideways.
  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(pageOverflow).toBeLessThanOrEqual(0);
});
