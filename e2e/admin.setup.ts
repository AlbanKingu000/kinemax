import { expect, test as setup } from '@playwright/test';
import { E2E_STAFF } from '../apps/api/scripts/e2e-account.ts';
import { STAFF_STATE } from './admin-helpers.ts';

for (const role of ['superAdmin', 'manager'] as const) {
  setup(`sign in the e2e ${role}`, async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL: baseURL ?? '' });
    const csrf = (await (await api.get('/api/auth/csrf')).json()) as { csrfToken: string };
    const { email, password } = E2E_STAFF[role];
    const login = await api.post('/api/auth/login', {
      headers: { Origin: baseURL ?? '', 'X-CSRF-Token': csrf.csrfToken },
      data: { email, password },
    });
    expect(login.status()).toBe(200);
    await api.storageState({ path: STAFF_STATE[role] });
    await api.dispose();
  });
}
