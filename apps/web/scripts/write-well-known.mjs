/**
 * Writes the two files that make an https link open the app.
 *
 * Android and iOS both refuse to hand a link to an app on the app's word alone:
 * they fetch a file from the domain and check that it names the app. Without
 * them, `autoVerify` and `associatedDomains` do nothing at all — the link opens
 * the browser and the feature looks broken for no visible reason.
 *
 *   /.well-known/assetlinks.json              Android, needs the signing
 *                                             certificate's SHA-256 fingerprint
 *   /.well-known/apple-app-site-association   iOS, needs the Apple team id
 *
 * Both values belong to accounts that do not exist yet, so they arrive as
 * environment variables and this writes nothing without them. Writing a file
 * with a placeholder fingerprint would be worse than writing none: verification
 * would fail against a file that looks correct, and that is a bad afternoon.
 *
 *   ANDROID_CERT_FINGERPRINT   eas credentials, or `keytool -list -v`.
 *                              Colon-separated hex, upper case.
 *   APPLE_TEAM_ID              The ten characters in App Store Connect.
 *
 * Run from the panel's build. The files land in `public/.well-known/`, which the
 * static export copies to the root of the site — the only place both platforms
 * look.
 *
 * It imports the claimed path straight from `@agora/core`'s source rather than
 * repeating it, so the app's claim and the domain's answer cannot disagree. That
 * needs Node 22, which strips the types on its own; the whole repository already
 * does (see the CI workflow).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import brand from '../../../packages/core/src/brand.json' with { type: 'json' };
import { SHARED_LINK_PREFIX } from '../../../packages/core/src/links.ts';

const here = dirname(fileURLToPath(import.meta.url));
const directory = join(here, '..', 'public', '.well-known');

const fingerprint = (process.env.ANDROID_CERT_FINGERPRINT ?? '').trim();
const teamId = (process.env.APPLE_TEAM_ID ?? '').trim();

/** Both platforms only claim the shared event page. See app.config.ts. */
const PATHS = [`${SHARED_LINK_PREFIX}*`];

function write(name, contents) {
  writeFileSync(join(directory, name), `${JSON.stringify(contents, null, 2)}\n`);
  console.log(`  wrote .well-known/${name}`);
}

if (fingerprint === '' && teamId === '') {
  // Nothing to claim yet. The directory is removed rather than left behind, so a
  // build after the variables are unset does not keep serving a stale claim.
  rmSync(directory, { recursive: true, force: true });
  console.log(
    'No ANDROID_CERT_FINGERPRINT or APPLE_TEAM_ID: shared links will open the web page, not the app.',
  );
  process.exit(0);
}

mkdirSync(directory, { recursive: true });

if (fingerprint !== '') {
  if (!/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(fingerprint.toUpperCase())) {
    throw new Error(
      `ANDROID_CERT_FINGERPRINT is not a SHA-256 fingerprint: expected 32 colon-separated hex pairs, got "${fingerprint}".`,
    );
  }

  write('assetlinks.json', [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: brand.androidPackage,
        sha256_cert_fingerprints: [fingerprint.toUpperCase()],
      },
    },
  ]);
} else {
  console.log('  no ANDROID_CERT_FINGERPRINT: Android links will open the browser.');
}

if (teamId !== '') {
  if (!/^[A-Z0-9]{10}$/.test(teamId)) {
    throw new Error(`APPLE_TEAM_ID is not a team id: expected ten characters, got "${teamId}".`);
  }

  // No extension on purpose: Apple fetches this exact name.
  write('apple-app-site-association', {
    applinks: {
      details: [
        { appIDs: [`${teamId}.${brand.iosBundleId}`], components: PATHS.map(pathComponent) },
      ],
    },
  });
} else {
  console.log('  no APPLE_TEAM_ID: iOS links will open Safari.');
}

/** Apple's own shape for a path: `/e/*` becomes `{ "/": "/e/*" }`. */
function pathComponent(path) {
  return { '/': path };
}
