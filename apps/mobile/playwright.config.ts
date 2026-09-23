import { defineConfig, devices } from '@playwright/test';

/**
 * The resident's app, in a browser.
 *
 * Until now not one test touched a screen of the app the neighbour actually uses.
 * Everything under it was tested — the calendar logic in `@agora/core`, the API
 * clients, the handlers — and the screens themselves were checked by opening them
 * by hand, which is exactly how the panel accumulated two bugs that a browser
 * found in a minute.
 *
 * Expo exports this app for web, so the same React Native code that ships in the
 * APK renders here. That is the trade: it is not a phone, so it says nothing about
 * VoiceOver, the push permission dialog, or how the map behaves on a four year old
 * Android. What it does say is whether a screen renders, whether a resident can
 * mark an event and find it again, and whether the shared link lands somewhere —
 * which is the class of failure that leaves a councillor looking at a spinner.
 *
 * It runs against the real export rather than a dev server: a static export is
 * what an `expo export` produces and what the web build would serve, and building
 * it is also how a route that cannot be exported gets caught.
 */
/** The demo build: no API, the seed bundled inside it. */
const PORT = 8081;

/**
 * The same app built the way a pilot ships it, pointed at an API that is not
 * there.
 *
 * A second export costs a couple of minutes in CI, and it buys the half of this
 * app that had never been tested: every screen above was passing while the build
 * that actually goes on a phone sat on its spinner for ever, because the demo
 * build never makes a request and so never fails one (D-068).
 *
 * Which API it points at is the script's business, not this file's — see
 * `scripts/serve-web-builds.mjs`.
 */
const API_PORT = 8082;

export default defineConfig({
  testDir: './tests',
  retries: 0,
  reporter: process.env.CI === undefined ? 'list' : 'github',
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...(process.env.CHROMIUM_PATH === undefined
      ? {}
      : { launchOptions: { executablePath: process.env.CHROMIUM_PATH } }),
    trace: 'retain-on-failure',
    // A phone, because that is what this app is. The width matters: the calendar
    // lays out differently and the tab bar floats over the content.
    ...devices['Pixel 7'],
    // Spanish, after the device spread, because the app reads the device's
    // language and a headless browser asks for en-US. Left alone, every screen
    // would be tested in the language almost none of its users has (D-065).
    locale: 'es-ES',
  },
  projects: [
    { name: 'android-sized', testIgnore: /offline\.spec\.ts/, use: {} },
    {
      name: 'sin-conexión',
      testMatch: /offline\.spec\.ts/,
      use: { baseURL: `http://localhost:${API_PORT}` },
    },
  ],
  // One entry, one script, because the two builds must not run at the same time:
  // Metro caches `EXPO_PUBLIC_*` inlined into a module, so parallel exports that
  // differ only by that variable contaminate each other. See the script (D-068).
  webServer: {
    command: 'node scripts/serve-web-builds.mjs',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: process.env.CI === undefined,
    // Two exports of 5.6MB each, both with the cache cleared. This is the slowest
    // thing in the repository and it is the price of testing what ships.
    timeout: 600_000,
  },
});
