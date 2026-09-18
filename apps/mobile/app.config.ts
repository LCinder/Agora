import type { ConfigContext, ExpoConfig } from 'expo/config';

import brand from '../../packages/core/src/brand.json';

/**
 * Expo configuration.
 *
 * Everything that does not depend on the commercial name stays in `app.json`.
 * This file exists to inject the five values that do, from the one file that
 * holds them, so the rename that is coming is one edit instead of a grep.
 *
 * The identifiers matter more than the display name: `android.package` and
 * `ios.bundleIdentifier` cannot be changed once the app is published in a
 * store, so the time to get them from a single place is now, before the first
 * submission. See `docs/renombrar-la-app.md`.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: brand.name,
  slug: brand.slug,
  scheme: brand.scheme,
  ios: { ...config.ios, bundleIdentifier: brand.iosBundleId },
  android: { ...config.android, package: brand.androidPackage },
});
