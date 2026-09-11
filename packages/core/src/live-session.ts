import { z } from 'zod';

/**
 * Live tracking of a procession, parade or pilgrimage.
 *
 * A volunteer shares their location for the duration of one session and
 * nothing else: the detailed trail is purged when the event ends, and only a
 * simplified route may be kept.
 */

export const LIVE_SESSION_STATUSES = ['scheduled', 'active', 'paused', 'ended'] as const;
export type LiveSessionStatus = (typeof LIVE_SESSION_STATUSES)[number];

/** GeoJSON LineString, the planned route drawn by the town hall. */
export const routeSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
});

export const livePositionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().nullable().default(null),
  recordedAt: z.coerce.date(),
});

export const liveSessionSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  municipalityId: z.string().min(1),
  status: z.enum(LIVE_SESSION_STATUSES),
  plannedRoute: routeSchema.nullable().default(null),
  startedAt: z.coerce.date().nullable().default(null),
  endedAt: z.coerce.date().nullable().default(null),
});

export type Route = z.infer<typeof routeSchema>;
export type LivePosition = z.infer<typeof livePositionSchema>;
export type LiveSession = z.infer<typeof liveSessionSchema>;

/**
 * How long a position may go without an update before the map stops presenting
 * it as the truth. Crowded streets kill mobile coverage, and a stale dot that
 * looks live is worse than an honest "last updated 4 min ago".
 */
export const STALE_POSITION_MINUTES = 2;

export function isPositionStale(position: Pick<LivePosition, 'recordedAt'>, now: Date): boolean {
  return now.getTime() - position.recordedAt.getTime() > STALE_POSITION_MINUTES * 60_000;
}

export function isBroadcasting(session: Pick<LiveSession, 'status'>): boolean {
  return session.status === 'active';
}
