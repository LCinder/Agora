/**
 * Builds and serves the two web exports the browser tests run against.
 *
 * There are two because the app ships in two shapes and only one of them was
 * ever tested: the demo build carries the calendar inside it and makes no
 * request, and the pilot build talks to an API. Every test passed for weeks while
 * the pilot build sat on its spinner for ever (D-068).
 *
 * It is a script rather than two `webServer` entries in the Playwright config
 * because of something that cost an hour and is worth writing down: **Metro
 * inlines `EXPO_PUBLIC_*` at transform time and caches the transformed module.**
 * Two exports that differ only by such a variable are, as far as the cache is
 * concerned, the same work — so the second one silently reuses the first one's
 * inlined value. Playwright starts `webServer` entries in parallel, which made
 * that a coin toss: a demo build came out with the test API's URL baked in, and
 * the suite then failed in the demo tests while the offline tests passed.
 *
 * So: one after the other, `--clear` on both, and the cache is not trusted.
 *
 * The API server starts before the demo one on purpose. Playwright waits on the
 * demo port, so by the time that answers the other is already up and the offline
 * project has something to talk to.
 */
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const DEMO_PORT = 8081;
const API_PORT = 8082;

/** A port with nothing behind it, so every request fails the way no coverage does. */
const DEAD_API = 'http://127.0.0.1:9999';

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, ...extraEnv },
    });

    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code ?? 'a signal'}`)),
    );
  });
}

function serve(directory, port) {
  const child = spawn(
    'npx',
    ['serve', '--no-clipboard', '--single', '--listen', String(port), directory],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );

  child.on('exit', (code) => {
    // If either server dies the suite is meaningless, so take the whole thing
    // down rather than let the tests time out one by one.
    console.error(`serve on ${port} exited with ${code ?? 'a signal'}`);
    process.exit(1);
  });

  return child;
}

// A stale directory is worse than no directory: it serves yesterday's bundle and
// the suite passes against code nobody wrote today.
rmSync('.web-build', { recursive: true, force: true });
rmSync('.web-build-api', { recursive: true, force: true });

console.log('\n▸ Exporting the pilot build (with an API that is not there)\n');
await run(
  'npx',
  ['expo', 'export', '--platform', 'web', '--output-dir', '.web-build-api', '--clear'],
  {
    EXPO_PUBLIC_API_BASE_URL: DEAD_API,
  },
);

console.log('\n▸ Exporting the demo build (no API, the seed inside it)\n');
await run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', '.web-build', '--clear'], {
  // Emptied rather than left alone: an inherited value from the shell would put
  // an API into the build whose whole point is not having one.
  EXPO_PUBLIC_API_BASE_URL: '',
});

serve('.web-build-api', API_PORT);
serve('.web-build', DEMO_PORT);

console.log(`\n▸ Serving demo on ${DEMO_PORT} and pilot on ${API_PORT}\n`);
