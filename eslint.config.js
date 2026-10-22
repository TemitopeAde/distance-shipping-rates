import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/**', '.astro/**', '.wix/**', 'node_modules/**', '.agents/**', '.claude/**', '.gemini/**', 'src/env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': ['warn', { allow: ['log', 'error'] }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'tests/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // App Market mockups: plain browser scripts rendered by headless Chrome.
    files: ['marketing/**/*.js'],
    languageOptions: { globals: { window: 'readonly', document: 'readonly' } },
  },
);
