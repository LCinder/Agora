import { activitiesOf, activityCategoryId, activityDefaults, type Activity } from './activity';
import { isVisibleToResidents, type AudienceTag, type Event } from './event';

/**
 * Calendar filters. Kept deliberately small: the demo showed that residents
 * use the category chips and little else, and every extra control pushes the
 * events themselves further down the screen.
 */
export interface EventFilters {
  categoryIds?: readonly string[];
  organizationIds?: readonly string[];
  audienceTags?: readonly AudienceTag[];
  freeOnly?: boolean;
}

function matchesCategory(categoryId: string, filters: EventFilters): boolean {
  if (!filters.categoryIds || filters.categoryIds.length === 0) return true;

  return filters.categoryIds.includes(categoryId);
}

/**
 * The lines of this event's programme that the category filter picks out.
 *
 * Empty when the filter is not about categories, so a caller can always ask and
 * only has something to say when there is something to say. It is what lets a
 * card explain itself: tapping "Infantil" and getting a four-day feria back is
 * confusing until the card adds "3 actividades infantiles", which is the true
 * and useful answer.
 */
export function matchingActivities(
  event: Event,
  activities: readonly Activity[],
  filters: EventFilters = {},
): Activity[] {
  if (!filters.categoryIds || filters.categoryIds.length === 0) return [];

  const defaults = activityDefaults(event);

  return activitiesOf(activities, event.id).filter((activity) =>
    matchesCategory(activityCategoryId(activity, defaults), filters),
  );
}

function matches(event: Event, filters: EventFilters, activities: readonly Activity[]): boolean {
  // The event's own category, or any of its programme's. A resident looking for
  // something for the children wants the feria that has a puppet show in it, not
  // only the events somebody filed under "Infantil" as a whole.
  if (!matchesCategory(event.categoryId, filters)) {
    if (matchingActivities(event, activities, filters).length === 0) return false;
  }

  if (filters.organizationIds && filters.organizationIds.length > 0) {
    if (event.organizationId === null) return false;
    if (!filters.organizationIds.includes(event.organizationId)) return false;
  }

  if (filters.audienceTags && filters.audienceTags.length > 0) {
    const hasTag = filters.audienceTags.some((tag) => event.audienceTags.includes(tag));
    if (!hasTag) return false;
  }

  // Deliberately the event's own price and not its programme's. A feria that
  // charges at the gate is not free because the tombola inside it is, and a
  // "Gratis" chip that returns things you have to pay to reach is worse than one
  // that returns fewer results.
  if (filters.freeOnly === true && !event.isFree) return false;

  return true;
}

/**
 * Applies the filters. An empty or absent filter matches everything, so the
 * caller can pass whatever the user has selected without special cases.
 *
 * The programme is optional: a caller that has not loaded the activities gets
 * the old behaviour, which is filtering on the events alone.
 */
export function filterEvents(
  events: readonly Event[],
  filters: EventFilters = {},
  activities: readonly Activity[] = [],
): Event[] {
  return events.filter((event) => matches(event, filters, activities));
}

/**
 * Narrows a list to what a resident may see. Never skip this on the app side:
 * events pending review must not leak before the town hall approves them.
 */
export function residentVisibleEvents(events: readonly Event[]): Event[] {
  return events.filter(isVisibleToResidents);
}

/** Events belonging to one municipality. The tenant boundary, applied in code. */
export function eventsForMunicipality(events: readonly Event[], municipalityId: string): Event[] {
  return events.filter((event) => event.municipalityId === municipalityId);
}

/**
 * Narrows a programme to what a resident may see, given the events they can see.
 *
 * An activity's visibility is its parent's first and its own second, so this
 * takes the events rather than a status: an activity whose event is not in the
 * list has no parent to inherit from and is dropped. That is what stops the
 * programme of a draft leaking through a list that was filtered event by event.
 */
export function residentVisibleActivitiesFor(
  activities: readonly Activity[],
  events: readonly Event[],
): Activity[] {
  const statuses = new Map(events.map((event) => [event.id, event.status]));

  return activities.filter((activity) => {
    const parent = statuses.get(activity.eventId);

    if (parent === undefined) return false;

    return (
      (parent === 'published' || parent === 'cancelled') &&
      (activity.status === 'published' || activity.status === 'cancelled')
    );
  });
}
