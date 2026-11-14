import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/**
 * Flat config (ESLint 9).
 *
 * Deliberately close to the Vite react-ts template defaults: type-aware
 * linting is left off so `npm run lint` stays fast, and correctness that needs
 * types is already covered by `tsc -b` in `npm run build`.
 */
export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'src/api/schema.d.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Tests and tooling may use node globals and looser typing.
    files: ['**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}', '*.config.{ts,js}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
);
