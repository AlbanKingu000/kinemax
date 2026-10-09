import { defineConfig } from 'vitest/config';

// Root-level tooling tests (scripts/). Workspaces have their own Vitest configs.
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['scripts/**/*.ts'],
      exclude: ['scripts/**/*.test.ts', 'scripts/audit-gate.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
