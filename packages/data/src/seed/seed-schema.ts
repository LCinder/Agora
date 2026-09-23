import {
  AUDIENCE_TAGS,
  EVENT_STATUSES,
  TIME_OF_DAY_PATTERN,
  activityLocationSchema,
  eventLocationSchema,
} from '@agora/core';
import { z } from 'zod';

/**
 * Shape of the seed files under `content/`.
 *
 * A seed event does not carry an instant, it carries a rule for producing one.
 * Fixed dates are for real calendar festivities; relative ones are resolved
 * against the day the app is opened, so a demo shown in a meeting never has an
 * empty "Hoy". See content/README.md.
 */

const timeOfDay = z.string().regex(TIME_OF_DAY_PATTERN, 'Expected a time of day as HH:mm');

export const fixedWhenSchema = z.object({
  kind: z.literal('fixed'),
  startAt: z.coerce.date(),
  endAt: z.coerce.date().optional(),
});

export const relativeWhenSchema = z.object({
  kind: z.literal('relative'),
  /** Days from today. Negative values place the event in the past. */
  startsInDays: z.number().int().min(-365).max(365),
  startTime: timeOfDay,
  endTime: timeOfDay.optional(),
});

export const seedWhenSchema = z.discriminatedUnion('kind', [fixedWhenSchema, relativeWhenSchema]);

/**
 * One line of a seeded programme.
 *
 * It carries a `when` of its own, resolved against today exactly like the
 * event's: a feria seeded to start in two days with a falconry show seeded for
 * three lands on the Friday and the Saturday whenever the demo is opened. The
 * three nullable fields mean "the same as the event", which is what almost every
 * line of a real programme says.
 */
export const seedActivitySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  categoryId: z.string().min(1).nullable().default(null),
  when: seedWhenSchema,
  location: activityLocationSchema.nullable().default(null),
  isFree: z.boolean().nullable().default(null),
  priceInfo: z.string().nullable().default(null),
  status: z.enum(EVENT_STATUSES).default('published'),
  rejectionReason: z.string().nullable().default(null),
});

export const seedEventSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1).nullable().default(null),
  title: z.string().min(1),
  description: z.string().default(''),
  categoryId: z.string().min(1),
  when: seedWhenSchema,
  allDay: z.boolean().default(false),
  location: eventLocationSchema,
  imageUrl: z.string().nullable().default(null),
  priceInfo: z.string().nullable().default(null),
  isFree: z.boolean().default(true),
  audienceTags: z.array(z.enum(AUDIENCE_TAGS)).default([]),
  status: z.enum(EVENT_STATUSES),
  rejectionReason: z.string().nullable().default(null),
  isFeatured: z.boolean().default(false),
  liveTrackingEnabled: z.boolean().default(false),
  /**
   * The programme, for an event that has one.
   *
   * Absent on almost every event, because almost every event is one thing at one
   * time. It is the feria, the semana cultural and the romería that need it.
   */
  activities: z.array(seedActivitySchema).default([]),
});

export type SeedWhen = z.infer<typeof seedWhenSchema>;
export type SeedActivity = z.infer<typeof seedActivitySchema>;
export type SeedEvent = z.infer<typeof seedEventSchema>;
