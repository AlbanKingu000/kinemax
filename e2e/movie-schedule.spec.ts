import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Movie page, schedule and booking placeholder against the production build and the demo catalog
// in kinemax_test (apps/api/scripts/e2e-catalog.ts: every show is available, prices are seeded).

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

/** Opens a page with Prizren already chosen (as after a first visit). */
async function openWithPrizren(page: Page, path: string) {
  await page.addInitScript(() => {
    window.localStorage.setItem('kinemax.location', 'prizren');
  });
  await page.goto(path);
}

const timeLink = /^\d{2}:\d{2}, /;

test('home → movie → day → time → booking placeholder', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/');
  await page
    .getByRole('dialog', { name: 'Zgjidh kinemanë' })
    .getByRole('button', { name: /Prizren/ })
    .click();

  const nowShowing = page.locator('#now-showing');
  const firstMovie = nowShowing.getByRole('heading', { level: 3 }).first();
  const title = (await firstMovie.textContent()) ?? '';
  await firstMovie.getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page).toHaveTitle(`${title} · Kinemax`);

  const showtimes = page.locator('section', {
    has: page.getByRole('heading', { level: 2, name: 'Oraret' }),
  });
  await expect(showtimes.getByRole('tab')).toHaveCount(7);
  await showtimes.getByRole('tab', { name: /^Nesër/ }).click();
  await expect(page).toHaveURL(/\?date=\d{4}-\d{2}-\d{2}$/);
  await expect(showtimes.getByText(/^nga \d+,\d{2} €$/).first()).toBeVisible();
  const time = showtimes.getByRole('link', { name: timeLink }).first();
  const label = (await time.getAttribute('aria-label')) ?? '';
  await time.click();

  await expect(page).toHaveURL(/\/booking\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Rezervimi' })).toBeVisible();
  const main = page.getByRole('main');
  await expect(main.getByText(title, { exact: true })).toBeVisible();
  await expect(main.getByText('Kinemax Prizren')).toBeVisible();
  await expect(main.getByText(new RegExp(`^${label.slice(0, 5)}–\\d{2}:\\d{2}$`))).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Zgjedhja e ulëseve vjen së shpejti' }),
  ).toBeVisible();
  expect(problems).toEqual([]);
});

test('schedule filters live in the URL: share, reload and back keep them', async ({
  page,
  context,
}) => {
  await openWithPrizren(page, '/schedule');
  await expect(page.getByRole('heading', { level: 1, name: 'Orari' })).toBeVisible();
  await expect(page.getByRole('article').first()).toBeVisible();

  await page.getByRole('tab', { name: /^Nesër/ }).click();
  await page.getByRole('button', { name: 'Standard', exact: true }).click();
  await page.getByRole('button', { name: 'Titra shqip' }).click();
  await expect(page).toHaveURL(/hallType=STANDARD/);
  await expect(page).toHaveURL(/language=ORIGINAL_SQ_SUBTITLES/);
  await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}/);
  const shared = page.url();

  // Every listed group matches the filters.
  const groups = page.getByRole('article').first().getByRole('heading', { level: 3 });
  await expect(groups.first()).toHaveText('Standard');

  // Another tab opens the same view from the shared link.
  const other = await context.newPage();
  await other.goto(shared);
  await expect(other.getByRole('button', { name: 'Standard', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(other.getByRole('button', { name: 'Titra shqip' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(other.getByRole('tab', { name: /^Nesër/ })).toHaveAttribute('aria-selected', 'true');
  await other.close();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Titra shqip' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Back undoes the last filter.
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Titra shqip' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByRole('button', { name: 'Standard', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // A filter that matches nothing offers to clear the filters.
  await page.goto('/schedule?hallType=NO_SUCH_HALL');
  await expect(page.getByText('Nuk ka shfaqje për këto filtra')).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'Pastro filtrat' }).last().click();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole('article').first()).toBeVisible();
});

test('day tabs and filter chips work with the keyboard', async ({ page }) => {
  await openWithPrizren(page, '/schedule');
  const today = page.getByRole('tab').first();
  await expect(today).toHaveAttribute('aria-selected', 'true');
  await today.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab').nth(1)).toBeFocused();
  await expect(page.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(page.getByRole('tab').nth(6)).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/date=/);

  const chip = page.getByRole('button', { name: '2D' });
  await chip.focus();
  await page.keyboard.press('Space');
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/format=2D/);
  await page.keyboard.press('Enter');
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
});

test('the movie and schedule pages pass axe and fit the screen', async ({ page, request }) => {
  const problems = collectProblems(page);
  const { movies } = (await (
    await request.get('/api/movies?status=NOW_SHOWING&location=prizren')
  ).json()) as { movies: { slug: string }[] };
  await openWithPrizren(page, `/movies/${movies[0]?.slug ?? ''}`);
  await expect(page.getByRole('link', { name: timeLink }).first()).toBeVisible();
  await expectNoAxeViolations(page);

  await page.goto('/schedule');
  await expect(page.getByRole('article').first()).toBeVisible();
  await expectNoAxeViolations(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(problems).toEqual([]);
});

test('unknown movies and showtimes get friendly pages', async ({ page }) => {
  await openWithPrizren(page, '/movies/no-such-movie');
  await expect(page.getByRole('heading', { level: 1, name: 'Faqja nuk u gjet' })).toBeVisible();
  await page.goto('/booking/0190f0a0-0000-7000-8000-000000000000');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Kjo shfaqje nuk u gjet' }),
  ).toBeVisible();
});
