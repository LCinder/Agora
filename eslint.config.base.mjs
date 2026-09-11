import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Shared lint rules for the framework-free workspace packages.
 * The Expo app and the Next.js app keep their own framework configs.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
