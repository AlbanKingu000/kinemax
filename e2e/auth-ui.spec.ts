import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Login, register and account UI against the production build and kinemax_test. One random .test
// account per project (register is rate limited to 5 per hour per IP for the whole e2e run).

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const PASSWORD = 'nje fjali e gjate per teste';
const NEW_PASSWORD = 'nje fjali tjeter per teste';

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .setLegacyMode()
    .analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

const uniqueEmail = () =>
  `e2e-ui-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}@kinemax.test`;

/** The account control: in the header on desktop, in the drawer on phones. */
async function openAccount(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole('button', { name: 'Hap menynë' }).click();
    return page.getByRole('dialog', { name: 'Menyja' });
  }
  return page.getByRole('banner');
}

async function signOut(page: Page, isMobile: boolean) {
  const area = await openAccount(page, isMobile);
  if (!isMobile) await area.getByRole('button', { name: /^Llogaria e / }).click();
  await area.getByRole('button', { name: 'Dil' }).click();
  await expect(page.getByText('Dole nga llogaria.')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // No cinema picker over the forms.
  await page.addInitScript(() => {
    window.localStorage.setItem('kinemax.location', 'prizren');
  });
});

test('register → header → logout → login → account edits → password → all devices', async ({
  page,
  isMobile,
}) => {
  // One long journey: register, three logins and a password change (each an argon2 hash on the
  // server) plus three axe scans. Under the full parallel suite this needs more than 30 s.
  test.setTimeout(60_000);
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text());
  });
  const email = uniqueEmail();

  await page.goto('/register');
  await expectNoAxeViolations(page);
  await page.getByLabel(/^Emri/).fill('Drita Gashi');
  await page.getByLabel(/^Email-i/).fill(email);
  await page.getByLabel(/^Fjalëkalimi/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Krijo llogarinë' }).click();
  await expect(page).toHaveURL(/\/$/);

  const area = await openAccount(page, isMobile);
  await expect(area.getByText(/Drita/).first()).toBeVisible();
  if (isMobile) await page.keyboard.press('Escape');
  await signOut(page, isMobile);

  // A foreign ?next= is ignored: after login the user stays on Kinemax.
  await page.goto('/login?next=%2F%2Fevil.example');
  await expectNoAxeViolations(page);
  await page.getByLabel(/^Email-i/).fill(email);
  await page.getByLabel(/^Fjalëkalimi/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Hyr', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/account');
  await expect(page.getByRole('heading', { level: 1, name: 'Llogaria ime' })).toBeVisible();
  await expectNoAxeViolations(page);
  await expect(page.getByLabel(/^Email-i/)).toHaveValue(email);
  await page.getByLabel(/^Emri/).fill('Drita G.');
  await page.getByRole('radio', { name: 'English' }).check();
  await page.getByRole('button', { name: 'Ruaj ndryshimet' }).click();
  await expect(page.getByText('Your changes were saved.')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.getByLabel(/^Current password/).fill(PASSWORD);
  await page.getByLabel(/^New password/).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  // Verifies the old and hashes the new password (argon2) while other workers render WebGL in
  // software: under full e2e load this can take longer than the default 5 s.
  await expect(page.getByText(/Your password was changed/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Sign out on all devices' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);

  // The new password works, the old one does not (same generic error as an unknown account).
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
  await expect(page.getByRole('alert')).toBeFocused();
  await page.getByLabel(/^Password/).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // Back where the protected page sent us.
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible();

  // Once more with a full foreign URL.
  await page.context().clearCookies();
  await page.goto('/login?next=https%3A%2F%2Fevil.example%2Faccount');
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`^${new URL(page.url()).origin}/$`));
  expect(
    problems.filter((p) => !p.includes('401') && !p.includes('Failed to load resource')),
  ).toEqual([]);
});
