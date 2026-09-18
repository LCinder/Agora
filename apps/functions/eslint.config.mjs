import base from '../../eslint.config.base.mjs';

/**
 * The build script is a plain Node script rather than a bundled module, so it is
 * the one file here that needs Node's globals declared: the TypeScript files get
 * them from `@types/node`.
 */
export default [
  ...base,
  {
    files: ['build.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
];
