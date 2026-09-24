import { TZDate } from '@date-fns/tz';
import { startOfDay } from 'date-fns';
import { z } from 'zod';

import { EVENT_STATUSES, type Event, type EventStatus } from './event';

/**
 * An activity: one line of an event's programme.
 *
 * The calendar used to have one shape of thing in it, and a town hall's year
 * does not. "Taller de cerámica" is an event and nothing else; "Feria medieval"
 * is four days with a falconry show, a cheese workshop and a tombola inside it,
 * and putting those three in the calendar as peers buries the feria under its
 * own programme. So an event either stands alone or holds activities, and the
 * calendar only ever shows events.
 *
 * An activity is deliberately thinner than an event. It has no poster, no
 * organiser of its own and no live tracking: it happens inside something that
 * already has all three. What it does have is a time, and its own "Asistiré"
 * — which is the point. A neighbour who wants to be reminded about the falcons
 * at six on Saturday should not have to be reminded about the whole feria, and a
 * town hall deciding next year's programme wants to know which of the twelve
 * things they paid for people actually turned up to.
 *
 * Three fields are nullable and mean "the same as the event": the category, the
 * place and the price. Almost every line of a real programme inherits all three,
 * and making them repeat it would be a form nobody fills in correctly.
 */

export const activityLocationSchema = z.object({
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
});

export const activitySchema = z
  .object({
    id: z.string().min(1),
    municipalityId: z.string().min(1),
    /** The event this belongs to. An activity never exists on its own. */
    eventId: z.string().min(1),

    title: z.string().min(1),
    description: z.string().default(''),

    /** Null to use the event's category, which is what most lines do. */
    categoryId: z.string().min(1).nullable().default(null),

    startAt: z.coerce.date(),
    endAt: z.coerce.date().nullable().default(null),

    /** Null when it happens wherever the event happens. */
    location: activityLocationSchema.nullable().default(null),

    /**
     * Null for "same as the event".
     *
     * Both together: a free feria with one paid workshop sets them on that one
     * line, and everything else inherits. `isFree` null and `priceInfo` set is
     * not a state the panel can produce.
     */
    isFree: z.boolean().nullable().default(null),
    priceInfo: z.string().nullable().default(null),

    /**
     * The same five states an event has, and for the same reasons.
     *
     * `cancelled` matters most here: the rain cancels the falconry show and not
     * the feria, and a line that simply vanishes from the programme reads as a
     * bug to somebody who was counting on it.
     */
    status: z.enum(EVENT_STATUSES),
    rejectionReason: z.string().nullable().default(null),

    /**
     * An edit waiting for the town hall, with the published values left alone.
     *
     * The same promise the events make (project document, 7.2): an untrusted
     * association editing something already published does not change what the
     * neighbours see. An event keeps that in a row of its own because the change
     * may touch a dozen fields; an activity has four worth changing, so it fits
     * in an attribute and costs no second row and no second inbox.
     */
    pendingPatch: z.record(z.string(), z.unknown()).nullable().default(null),

    /**
     * How many neighbours marked this line. Never who.
     *
     * The same rules as the event's own tally: written by residents, never by an
     * editor, and shown only from `MINIMUM_AUDIENCE` upwards. There is no view
     * count beside it because there is nothing to count — an activity has no
     * screen of its own to open, it is a line on the event's.
     */
    interestCount: z.number().int().min(0).default(0),

    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .refine(
    (activity) => activity.endAt === null || activity.endAt.getTime() >= activity.startAt.getTime(),
    { message: 'An activity cannot end before it starts', path: ['endAt'] },
  )
  .refine((activity) => activity.status !== 'rejected' || activity.rejectionReason !== null, {
    message: 'A rejected activity must say why',
    path: ['rejectionReason'],
  });

export type ActivityLocation = z.infer<typeof activityLocationSchema>;
export type Activity = z.infer<typeof activitySchema>;

/** What an activity inherits from its event when it does not say otherwise. */
export interface ActivityDefaults {
  categoryId: string;
  location: { name: string; latitude: number | null; longitude: number | null };
  isFree: boolean;
  priceInfo: string | null;
}

export function activityDefaults(event: Event): ActivityDefaults {
  return {
    categoryId: event.categoryId,
    location: event.location,
    isFree: event.isFree,
    priceInfo: event.priceInfo,
  };
}

/** The category this activity is filed under, its own or the event's. */
export function activityCategoryId(activity: Activity, defaults: ActivityDefaults): string {
  return activity.categoryId ?? defaults.categoryId;
}

/** Where it happens, its own place or the event's. */
export function activityLocation(
  activity: Activity,
  defaults: ActivityDefaults,
): ActivityDefaults['location'] {
  return activity.location ?? defaults.location;
}

/** What it costs, its own price or the event's. */
export function activityPrice(
  activity: Activity,
  defaults: ActivityDefaults,
): { isFree: boolean; priceInfo: string | null } {
  if (activity.isFree === null) {
    return { isFree: defaults.isFree, priceInfo: defaults.priceInfo };
  }

  return { isFree: activity.isFree, priceInfo: activity.priceInfo };
}

/**
 * True when the activity says something different from the event about where.
 *
 * What the programme uses to decide whether to print a place under a line. In a
 * feria every line is in the same square except the two in the sports hall, and
 * repeating the square twelve times is how the two that matter get missed.
 */
export function activityHasOwnLocation(activity: Activity, defaults: ActivityDefaults): boolean {
  return activity.location !== null && activity.location.name !== defaults.location.name;
}

/**
 * What residents may see, given the state of the event it hangs off.
 *
 * Two conditions, and the parent's comes first: an activity of a draft is not
 * public however published the line itself says it is. The store enforces the
 * same thing by leaving such a row out of the calendar index, so this is the
 * second lock on the same door — the one the app applies to whatever it was
 * given.
 */
export function isActivityVisible(
  activity: Pick<Activity, 'status'>,
  parentStatus: EventStatus,
): boolean {
  if (parentStatus !== 'published' && parentStatus !== 'cancelled') return false;

  return activity.status === 'published' || activity.status === 'cancelled';
}

/** An activity waiting on the town hall: a new line, or an edit to a published one. */
export function isActivityAwaitingReview(
  activity: Pick<Activity, 'status' | 'pendingPatch'>,
): boolean {
  return activity.status === 'pending_review' || activity.pendingPatch !== null;
}

/** When the activity is over. A line with no announced end lasts as long as its start. */
export function activityEndsAt(activity: Pick<Activity, 'startAt' | 'endAt'>): Date {
  return activity.endAt ?? activity.startAt;
}

/** The activities of one event, in the order the programme is read. */
export function activitiesOf(activities: readonly Activity[], eventId: string): Activity[] {
  return activities
    .filter((activity) => activity.eventId === eventId)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/** How many activities each event has, for a list that wants the number and not the lines. */
export function countByEvent(activities: readonly Activity[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const activity of activities) {
    counts.set(activity.eventId, (counts.get(activity.eventId) ?? 0) + 1);
  }

  return counts;
}

/**
 * The span an event really occupies, once its programme is taken into account.
 *
 * A feria typed in as "starts Thursday 10:00" with no end would drop out of
 * "Hoy" on Thursday evening and never come back, while its Saturday activities
 * were still to happen. So where there are activities the end is the latest of
 * everything: the event's own end, and the end of its last line.
 *
 * Only the end moves. An event that starts before its programme does is an
 * event with a gate that opens early, and pulling its start backwards to match
 * an activity would be inventing a time nobody announced.
 */
export function eventSpan(
  event: Pick<Event, 'startAt' | 'endAt'>,
  activities: readonly Activity[] = [],
): { startAt: Date; endAt: Date } {
  let endAt = event.endAt ?? event.startAt;

  for (const activity of activities) {
    const ends = activityEndsAt(activity);

    if (ends.getTime() > endAt.getTime()) endAt = ends;
  }

  return { startAt: event.startAt, endAt };
}

/** The activities happening inside a time range, both ends inclusive. */
export function activitiesWithin(
  activities: readonly Activity[],
  range: { start: Date; end: Date },
): Activity[] {
  return activities.filter(
    (activity) =>
      activity.startAt.getTime() <= range.end.getTime() &&
      activityEndsAt(activity).getTime() >= range.start.getTime(),
  );
}

/** One day of a programme: the date it falls on and what is on that day. */
export interface ActivityDay {
  /** Midnight of that day in the municipality's time zone. */
  date: Date;
  activities: Activity[];
}

/**
 * The programme, broken into days.
 *
 * Which is how a feria is printed on the poster and how somebody reads it:
 * nobody scans twenty lines looking for Saturday, they look for the heading that
 * says Saturday. Days with nothing in them are not produced — a programme with a
 * gap on the Friday should show Thursday and then Saturday, not an empty box.
 */
export function groupActivitiesByDay(
  activities: readonly Activity[],
  timeZone: string,
): ActivityDay[] {
  const days = new Map<number, Activity[]>();

  for (const activity of activities) {
    const midnight = startOfDay(new TZDate(activity.startAt, timeZone)).getTime();
    const day = days.get(midnight);

    if (day === undefined) days.set(midnight, [activity]);
    else day.push(activity);
  }

  return [...days.entries()]
    .sort(([left], [right]) => left - right)
    .map(([midnight, entries]) => ({
      date: new Date(midnight),
      activities: entries.sort((a, b) => a.startAt.getTime() - b.startAt.getTime()),
    }));
}
