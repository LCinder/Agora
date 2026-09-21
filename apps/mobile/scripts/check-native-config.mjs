/**
 * Checks that what the app declares natively is what the app actually does.
 *
 * This exists because of a bug that survived months: `expo-calendar` and
 * `expo-location` were dependencies and the code called them, but neither was a
 * config plugin — so no usage description reached `Info.plist`. On iOS that is
 * not a degraded feature, it is a crash on the permission prompt and a rejected
 * submission, and nothing caught it because the CI only ever built the Android
 * APK.
 *
 * The check runs the real resolver (`expo config --type introspect`) rather than
 * reading `app.json`, so it sees what a build would see, including whatever the
 * plugins do.
 *
 * It asserts in both directions, and the second one is the useful one: a
 * permission declared but never asked for is a question at review and a promise
 * the privacy policy has to keep. Adding one means adding it here, on purpose.
 */
import { execFileSync } from 'node:child_process';

/** Declared, because the code asks for it. */
const REQUIRED = {
  // event/[id].tsx: addToCalendar reads the calendar list and writes one event.
  NSCalendarsUsageDescription: 'expo-calendar',
  NSCalendarsFullAccessUsageDescription: 'expo-calendar',
  // welcome.tsx suggests a municipality; volunteer.tsx emits during a procession.
  NSLocationWhenInUseUsageDescription: 'expo-location',
};

/**
 * Absent, because the app never asks. Each of these is a permission a plugin
 * declares by default and we delete.
 */
const FORBIDDEN = {
  NSLocationAlwaysUsageDescription: 'the volunteer emits in the foreground (D-016)',
  NSLocationAlwaysAndWhenInUseUsageDescription: 'the volunteer emits in the foreground (D-016)',
  NSRemindersUsageDescription: 'nothing in the app touches reminders',
  NSRemindersFullAccessUsageDescription: 'nothing in the app touches reminders',
  NSMotionUsageDescription: 'nothing in the app reads motion',
  NSPhotoLibraryUsageDescription: 'the poster is uploaded from the panel, not the app',
  NSMicrophoneUsageDescription: 'nothing in the app records',
  NSCameraUsageDescription: 'nothing in the app uses the camera',
};

/** Android permissions that must not be requested. */
const FORBIDDEN_ANDROID = {
  'android.permission.ACCESS_BACKGROUND_LOCATION': 'the volunteer emits in the foreground (D-016)',
  'android.permission.RECORD_AUDIO': 'nothing in the app records',
  'android.permission.CAMERA': 'nothing in the app uses the camera',
};

const output = execFileSync('npx', ['expo', 'config', '--type', 'introspect', '--json'], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'inherit'],
});

const config = JSON.parse(output);
const plist = config.ios?.infoPlist ?? {};
const android = config.android?.permissions ?? [];
const problems = [];

// --- deep links -----------------------------------------------------------
//
// Both platforms only hand a link to the app when the app claims the domain AND
// the domain vouches for the app. Half of that lives here; the other half is
// apps/web/scripts/write-well-known.mjs. A claim on the wrong host, or on a
// path the app has no screen for, fails silently — the link opens the browser
// and nothing says why.
const siteUrl = (process.env.EXPO_PUBLIC_SITE_URL ?? '').trim();
const associated = config.ios?.associatedDomains ?? [];
const filters = config.android?.intentFilters ?? [];

if (siteUrl === '') {
  if (associated.length > 0 || filters.length > 0) {
    problems.push(
      'A domain is claimed without EXPO_PUBLIC_SITE_URL, so it cannot be the right one.',
    );
  }
} else {
  const host = new URL(siteUrl).host;

  if (!associated.includes(`applinks:${host}`)) {
    problems.push(`iOS does not claim ${host}, so a shared link will open Safari.`);
  }

  const claimsPath = filters.some((filter) =>
    (filter.data ?? []).some(
      (datum) => datum.host === host && datum.scheme === 'https' && datum.pathPrefix === '/e/',
    ),
  );

  if (!claimsPath) {
    problems.push(`Android does not claim https://${host}/e/, so a shared link will open Chrome.`);
  }

  if (filters.some((filter) => (filter.data ?? []).some((datum) => datum.pathPrefix === '/'))) {
    problems.push(
      'Android claims the whole site, which takes the panel and the legal pages into an app that has neither.',
    );
  }
}

for (const [key, source] of Object.entries(REQUIRED)) {
  const value = plist[key];

  if (typeof value !== 'string' || value.trim() === '') {
    problems.push(`${key} is missing. The app calls ${source}, so iOS needs this string.`);
    continue;
  }

  // The plugins' own defaults are in English and say "Allow $(PRODUCT_NAME) to…".
  // Shipping one means nobody wrote the reason the resident is about to read.
  if (value.startsWith('Allow $(PRODUCT_NAME)')) {
    problems.push(`${key} still has the default text from ${source}. Write the reason in Spanish.`);
  }
}

for (const [key, why] of Object.entries(FORBIDDEN)) {
  if (key in plist) problems.push(`${key} is declared and should not be: ${why}.`);
}

for (const [permission, why] of Object.entries(FORBIDDEN_ANDROID)) {
  if (android.includes(permission)) {
    problems.push(`${permission} is requested and should not be: ${why}.`);
  }
}

// Background location on iOS is a mode, not a usage string, and it is the one
// the stores review hardest.
if ((plist.UIBackgroundModes ?? []).includes('location')) {
  problems.push('UIBackgroundModes includes location, which the MVP deliberately does not use.');
}

if (problems.length > 0) {
  console.error(`\nWhat the app declares is not what the app does:\n`);
  for (const problem of problems) console.error(`  · ${problem}`);
  console.error('');
  process.exit(1);
}

const declared = Object.keys(REQUIRED).length;
const links =
  siteUrl === '' ? 'no domain claimed yet' : `${new URL(siteUrl).host} claimed for /e/*`;

console.log(`${declared} permissions declared and nothing else; deep links: ${links}.`);
