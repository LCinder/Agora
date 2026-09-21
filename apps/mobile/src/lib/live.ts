import { type LiveClient, createLiveClient } from '@agora/data';

import { apiBaseUrl, usingRealBackend } from './data';

/**
 * The live map's own client, or null in the demo.
 *
 * Null is the signal the screen reads to replay the recorded route instead: the
 * demo has to work with no network at all, and a procession that never moves is
 * not something to show a councillor.
 */
export const liveClient: LiveClient | null = usingRealBackend
  ? createLiveClient({ baseUrl: apiBaseUrl })
  : null;
