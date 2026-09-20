import type { ConfigContext, ExpoConfig } from 'expo/config';

import brand from '../../packages/core/src/brand.json';

/**
 * Expo configuration.
 *
 * Everything that does not depend on the commercial name stays in `app.json`.
 * This file exists to inject the values that do, from the one file that holds
 * them, so the rename that is coming is one edit instead of a grep.
 *
 * The identifiers matter more than the display name: `android.package` and
 * `ios.bundleIdentifier` cannot be changed once the app is published in a
 * store, so the time to get them from a single place is now, before the first
 * submission. See `docs/renombrar-la-app.md`.
 */

/**
 * The host a shared link points at, or null while there is no domain.
 *
 * `EXPO_PUBLIC_SITE_URL` is the same variable the app reads at runtime to build
 * the links it shares, so the domain that receives them and the domain declared
 * here cannot drift apart.
 *
 * Read here rather than imported from `@agora/core`: Expo compiles this file on
 * its own and its resolver only follows the JSON above, not a relative
 * TypeScript import. `check:native` is what keeps the two readings honest — it
 * compares the claim this produces against the same variable.
 */
function siteHost(): string | null {
  const url = process.env.EXPO_PUBLIC_SITE_URL?.trim() ?? '';

  if (url === '') return null;

  const host = /^https?:\/\/([a-z0-9.-]+(?::\d+)?)(?:\/|$)/i.exec(url)?.[1];

  // A malformed value would otherwise become an app that claims a domain nobody
  // owns, which is a verification that fails silently on both platforms.
  if (host === undefined) throw new Error(`EXPO_PUBLIC_SITE_URL is not a URL: ${url}`);

  return host.toLowerCase();
}

/**
 * Makes the shared https link open the app instead of the browser.
 *
 * Both platforms verify the claim against a file served from the domain — that
 * is the point of these, and why claiming a domain you do not control does
 * nothing at all. `apps/web/scripts/write-well-known.mjs` writes the two files.
 *
 * Only `/e/*` is claimed. Claiming the whole site would take the panel and the
 * legal pages into an app that has neither.
 */
function deepLinks(host: string | null): Partial<Pick<ExpoConfig, 'ios' | 'android'>> {
  if (host === null) return {};

  return {
    ios: { associatedDomains: [`applinks:${host}`] },
    android: {
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          // The same `/e/` that `@agora/core` declares and the two .well-known
          // files answer for. `check:native` fails if they stop agreeing.
          data: [{ scheme: 'https', host, pathPrefix: '/e/' }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
  };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const links = deepLinks(siteHost());

  return {
    ...config,
    name: brand.name,
    slug: brand.slug,
    scheme: brand.scheme,
    ios: { ...config.ios, bundleIdentifier: brand.iosBundleId, ...links.ios },
    android: { ...config.android, package: brand.androidPackage, ...links.android },
  };
};
