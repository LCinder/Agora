import { z } from 'zod';

/**
 * The event is the centre of the product: everything else hangs off it.
 */

export const EVENT_STATUSES = [
  'draft',
  'pending_review',
  'published',
  'rejected',
  'cancelled',
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

export const AUDIENCE_TAGS = ['children', 'youth', 'families', 'seniors'] as const;
export type AudienceTag = (typeof AUDIENCE_TAGS)[number];

export const eventLocationSchema = z.object({
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
});

export const eventSchema = z
  .object({
    id: z.string().min(1),
    municipalityId: z.string().min(1),
    /** Null when the town hall itself organises the event. */
    organizationId: z.string().min(1).nullable().default(null),

    title: z.string().min(1),
    description: z.string().default(''),
    categoryId: z.string().min(1),

    startAt: z.coerce.date(),
    /** Null for an event with no announced end time. */
    endAt: z.coerce.date().nullable().default(null),
    allDay: z.boolean().default(false),

    location: eventLocationSchema,
    imageUrl: z.string().nullable().default(null),

    /** Free text such as "5 € en taquilla"; `isFree` is what the filter uses. */
    priceInfo: z.string().nullable().default(null),
    isFree: z.boolean().default(true),
    audienceTags: z.array(z.enum(AUDIENCE_TAGS)).default([]),

    status: z.enum(EVENT_STATUSES),
    rejectionReason: z.string().nullable().default(null),
    isFeatured: z.boolean().default(false),
    liveTrackingEnabled: z.boolean().default(false),

    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    publishedAt: z.coerce.date().nullable().default(null),
  })
  .refine((event) => event.endAt === null || event.endAt.getTime() >= event.startAt.getTime(), {
    message: 'An event cannot end before it starts',
    path: ['endAt'],
  })
  .refine((event) => event.status !== 'rejected' || event.rejectionReason !== null, {
    message: 'A rejected event must say why',
    path: ['rejectionReason'],
  });

export type EventLocation = z.infer<typeof eventLocationSchema>;
export type Event = z.infer<typeof eventSchema>;

/**
 * What residents are allowed to see.
 *
 * Cancelled events stay visible on purpose: a neighbour who planned their
 * evening around an event needs to find out it was called off, and an event
 * that simply disappears looks like a bug.
 */
export function isVisibleToResidents(event: Pick<Event, 'status'>): boolean {
  return event.status === 'published' || event.status === 'cancelled';
}

/** An event awaiting a decision from the town hall. */
export function isAwaitingReview(event: Pick<Event, 'status'>): boolean {
  return event.status === 'pending_review';
}

/**
 * When the event is over. Events with no announced end are treated as lasting
 * until the end of their start day, so an 20:00 concert does not vanish from
 * "today" the second it begins.
 */
export function eventEndsAt(event: Pick<Event, 'startAt' | 'endAt'>): Date {
  return event.endAt ?? event.startAt;
}

/** Whether the event overlaps a time range, both ends inclusive. */
export function occursWithin(
  event: Pick<Event, 'startAt' | 'endAt'>,
  range: { start: Date; end: Date },
): boolean {
  return (
    event.startAt.getTime() <= range.end.getTime() &&
    eventEndsAt(event).getTime() >= range.start.getTime()
  );
}

/** Chronological order, the only order the calendar ever uses. */
export function byStartDate(a: Pick<Event, 'startAt'>, b: Pick<Event, 'startAt'>): number {
  return a.startAt.getTime() - b.startAt.getTime();
}
