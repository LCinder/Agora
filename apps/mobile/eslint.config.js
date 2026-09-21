const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // `.web-build` is the app exported for web, which its browser tests run
    // against; `test-results` is what Playwright leaves behind when one fails.
    // Both are generated, both are bundled library code, and linting either says
    // nothing about this repository.
    ignores: ['dist/*', '.expo/*', '.web-build/*', 'test-results/*', 'playwright-report/*'],
  },
]);
