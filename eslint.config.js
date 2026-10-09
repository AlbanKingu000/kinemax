import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules',
    '**/dist',
    '**/coverage',
    'playwright-report',
    'test-results',
    'apps/api/src/generated',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      'apps/api/**/*.ts',
      'packages/**/*.ts',
      'e2e/**/*.ts',
      'scripts/**/*.ts',
      '*.config.ts',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    // Vite/Vitest config files of the web app are type-checked by tsconfig.node.json.
    files: ['apps/web/*.config.ts', '**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    // Never render raw HTML (CLAUDE.md security rule).
    files: ['apps/web/src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is not allowed.',
        },
      ],
    },
  },
  prettier,
]);
