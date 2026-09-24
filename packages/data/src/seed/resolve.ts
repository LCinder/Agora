import { activitySchema, atLocalTime, eventSchema, type Activity, type Event } from '@agora/core';

import type { SeedActivity, SeedEvent, SeedWhen } from './seed-schema';

/**
 * Turns a seed event into a real one.
 *
 * Relative dates are resolved in the time zone of the municipality, so an
 * event seeded at 22:00 is at 22:00 for the neighbour whatever the device
 * clock says and whatever side of the October time change the demo falls on.
 */

/** Stand-in creation date for seeded events; they have no real history. */
const SEED_TIMESTAMP = new Date('2026-09-01T09:00:00Z');

/**
 * Plausible tallies for the demo, which has no residents to produce real ones.
 *
 * The demo build has no API and nobody has marked anything, so every event
 * would show nothing where the app shows "asistirán N vecinos" — and a
 * calendar where no event has an audience is the opposite of what this screen
 * is for in a meeting. The numbers are derived from the event's own id, so they
 * are the same on every reload: statistics that move when a councillor
 * refreshes the page invite exactly the question we do not want.
 *
 * Roughly one in eight of the people who open an event marks it, which is what
 * makes the pair of numbers read as a real one rather than as two random ones.
 * This is the demo's invention and nothing reads it once there is an API, where
 * both numbers come off the event's own counters.
 */
function demoTallies(
  id: string,
  isFeatured: boolean,
): { interestCount: number; viewCount: number } {
  let hash = 0;

  for (const character of id) {
    hash = (hash * 31 + character.charCodeAt(0)) % 100_000;
  }

  const interest = (18 + (hash % 140)) * (isFeatured ? 3 : 1);

  return { interestCount: interest, viewCount: interest * 8 + (hash % 37) };
}

export interface ResolveContext {
  municipalityId: string;
  timeZone: string;
  now: Date;
}

function resolveWhen(
  when: SeedWhen,
  context: ResolveContext,
): { startAt: Date; endAt: Date | null } {
  if (when.kind === 'fixed') {
    return { startAt: when.startAt, endAt: when.endAt ?? null };
  }

  const startAt = atLocalTime(context.now, when.startsInDays, when.startTime, context.timeZone);

  if (when.endTime === undefined) {
    return { startAt, endAt: null };
  }

  let endAt = atLocalTime(context.now, when.startsInDays, when.endTime, context.timeZone);

  // An event running from 22:00 to 00:30 ends the next day.
  if (endAt.getTime() < startAt.getTime()) {
    endAt = atLocalTime(context.now, when.startsInDays + 1, when.endTime, context.timeZone);
  }

  return { startAt, endAt };
}

export function resolveSeedEvent(seed: SeedEvent, context: ResolveContext): Event {
  const { when, activities: _activities, ...rest } = seed;
  const { startAt, endAt } = resolveWhen(when, context);

  return eventSchema.parse({
    ...demoTallies(seed.id, seed.isFeatured === true),
    ...rest,
    municipalityId: context.municipalityId,
    startAt,
    endAt,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    publishedAt: seed.status === 'published' || seed.status === 'cancelled' ? SEED_TIMESTAMP : null,
  });
}

/**
 * Plausible marks for one line of a seeded programme.
 *
 * A tenth of what a whole event carries, from the same hash of the same id, so a
 * feria with a hundred and forty marks shows lines with a dozen or two — which is
 * the shape a real programme has. The alternative in a meeting is a feria whose
 * every activity reads as empty, which says the opposite of what the screen is
 * there to say.
 */
function demoActivityTally(id: string): number {
  let hash = 0;

  for (const character of id) {
    hash = (hash * 31 + character.charCodeAt(0)) % 100_000;
  }

  return 6 + (hash % 44);
}

export function resolveSeedActivity(
  seed: SeedActivity,
  eventId: string,
  context: ResolveContext,
): Activity {
  const { when, ...rest } = seed;
  const { startAt, endAt } = resolveWhen(when, context);

  return activitySchema.parse({
    ...rest,
    municipalityId: context.municipalityId,
    eventId,
    startAt,
    endAt,
    interestCount: demoActivityTally(seed.id),
    pendingPatch: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  });
}
