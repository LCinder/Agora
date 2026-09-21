import { defineConfig, devices } from '@playwright/test';

/**
 * The panel, in a browser.
 *
 * Everything else in this repository is tested without one: the rules against a
 * real DynamoDB, the handlers against the real stores, the clients against the
 * real handlers. What none of that catches is a screen — and the two things this
 * panel got wrong so far were exactly that: a live session with no button to
 * start it, and a page that would have sat on "Cargando…" for ever without
 * anybody noticing.
 *
 * So this suite is small and blunt on purpose. It opens every screen of the demo,
 * checks it rendered something real rather than a spinner, and walks the two
 * flows a town hall actually performs: approving an association's event, and
 * arming a live session. It is not a design review and it does not assert
 * pixels.
 *
 * It runs against `next dev`, which is what a developer runs. The static export
 * is checked by the build in CI.
 */
export default defineConfig({
  testDir: './tests',
  // A failing screen is a failing screen; retrying only hides a flake that is
  // usually a missing await in the test itself.
  retries: 0,
  reporter: process.env.CI === undefined ? 'list' : 'github',
  use: {
    baseURL: 'http://localhost:3000',
    // The container here has Chromium already; CI installs its own.
    ...(process.env.CHROMIUM_PATH === undefined
      ? {}
      : { launchOptions: { executablePath: process.env.CHROMIUM_PATH } }),
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: process.env.CI === undefined,
    timeout: 120_000,
  },
});
