import { atLocalTime, eventSchema, type Event } from '@agora/core';

import type { SeedEvent, SeedWhen } from './seed-schema';

/**
 * Turns a seed event into a real one.
 *
 * Relative dates are resolved in the time zone of the municipality, so an
 * event seeded at 22:00 is at 22:00 for the neighbour whatever the device
 * clock says and whatever side of the October time change the demo falls on.
 */

/** Stand-in creation date for seeded events; they have no real history. */
const SEED_TIMESTAMP = new Date('2026-09-01T09:00:00Z');

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
  const { when, ...rest } = seed;
  const { startAt, endAt } = resolveWhen(when, context);

  return eventSchema.parse({
    ...rest,
    municipalityId: context.municipalityId,
    startAt,
    endAt,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    publishedAt: seed.status === 'published' || seed.status === 'cancelled' ? SEED_TIMESTAMP : null,
  });
}
