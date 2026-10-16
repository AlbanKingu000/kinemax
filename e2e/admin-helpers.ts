import { join } from 'node:path';

// The admin specs start signed in: admin.setup.ts signs both staff accounts in once for the
// whole run (through the API) and keeps the sessions here, so the run stays under the login
// rate limit (20 per IP per 15 minutes).
export const STAFF_STATE = {
  superAdmin: join('test-results', 'admin-auth', 'super-admin.json'),
  manager: join('test-results', 'admin-auth', 'manager.json'),
} as const;
