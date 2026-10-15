import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
      setupFiles: ['src/test/setup.ts'],
      // Full-app tests render the router and chain several steps that may each wait up to 5 s
      // (STEP_WAIT) under coverage and parallel files; a 5 s limit for the whole test contradicts that.
      testTimeout: 15_000,
      // Process CSS so tokens.css?raw returns the real file (the contrast test reads it).
      css: { include: [/tokens\.css/] },
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
        thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
      },
    },
  }),
);
