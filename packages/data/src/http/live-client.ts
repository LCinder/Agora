import { LIVE_SESSION_STATUSES, livePositionSchema, routeSchema } from '@agora/core';
import { z } from 'zod';

import { type ApiClient, type ApiClientOptions, createApiClient } from './client';

/**
 * What a resident's map reads while the procession is out.
 *
 * Separate from `DataSource` on purpose: everything there is the calendar, which
 * is cached for a minute and asked for once per screen. This is asked for every
 * few seconds and cached for five, so mixing them would mean one of the two
 * getting the wrong caching.
 *
 * The API hands over the **latest position and nothing else** — never the trail,
 * which is nobody's business while it is happening (D-043).
 */
const liveViewSchema = z.object({
  status: z.enum(LIVE_SESSION_STATUSES),
  position: livePositionSchema.nullable(),
  plannedRoute: routeSchema.nullable(),
  /** Kept after the event, so a map opened the next morning still shows something. */
  simplifiedRoute: routeSchema.nullable(),
});

export type LiveView = z.infer<typeof liveViewSchema>;

export interface LiveClientOptions extends ApiClientOptions {
  client?: ApiClient;
}

export interface LiveClient {
  /** Null when the event has no live session at all. */
  view(eventId: string): Promise<LiveView | null>;
}

export function createLiveClient(options: LiveClientOptions): LiveClient {
  const api = options.client ?? createApiClient(options);

  return {
    async view(eventId) {
      return api.getOrNull(`/live/${encodeURIComponent(eventId)}`, (value) =>
        liveViewSchema.parse(value),
      );
    },
  };
}
