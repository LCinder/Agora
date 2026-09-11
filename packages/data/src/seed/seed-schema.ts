import {
  AUDIENCE_TAGS,
  EVENT_STATUSES,
  TIME_OF_DAY_PATTERN,
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
});

export type SeedWhen = z.infer<typeof seedWhenSchema>;
export type SeedEvent = z.infer<typeof seedEventSchema>;
