import { type DataSource, createHttpDataSource, createSeedDataSource } from '@agora/data';

/**
 * The single data source for the app.
 *
 * Two implementations of one interface, and which one is used depends on whether
 * there is an API to talk to:
 *
 *   * `EXPO_PUBLIC_API_BASE_URL` set → the real backend.
 *   * not set → the seed files under `content/`, which is the demo. It works with
 *     no network at all, which is exactly what it is for: a phone on a table in
 *     front of a councillor, in a town hall meeting room with bad wifi.
 *
 * The variable is baked in at build time, which is what `EXPO_PUBLIC_` means, so a
 * demo build and a pilot build differ by one environment variable and nothing else.
 * No screen knows the difference (D-001).
 */
const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

export const usingRealBackend = baseUrl !== '';

/** Empty in the demo. Anything that writes has to check `usingRealBackend` first. */
export const apiBaseUrl = baseUrl;

export const dataSource: DataSource = usingRealBackend
  ? createHttpDataSource({ baseUrl })
  : createSeedDataSource();
