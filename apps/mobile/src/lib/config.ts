/**
 * Runtime configuration of the app.
 *
 * The commercial name is still pending, so nothing here spells it out: the
 * scheme comes from `brand.json` through @agora/core, and the public site can
 * be pointed at the real domain with `EXPO_PUBLIC_SITE_URL` the day there is
 * one, without touching a build.
 */

import { BRAND } from '@agora/core';

/** Where a shared link lands for someone without the app installed. */
export const PUBLIC_SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? `https://${BRAND.slug}.example`;

/** URL scheme registered in app.config.ts, used for deep links. */
export const APP_SCHEME = BRAND.scheme;
