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

function matches(event: Event, filters: EventFilters): boolean {
  if (filters.categoryIds && filters.categoryIds.length > 0) {
    if (!filters.categoryIds.includes(event.categoryId)) return false;
  }

  if (filters.organizationIds && filters.organizationIds.length > 0) {
    if (event.organizationId === null) return false;
    if (!filters.organizationIds.includes(event.organizationId)) return false;
  }

  if (filters.audienceTags && filters.audienceTags.length > 0) {
    const hasTag = filters.audienceTags.some((tag) => event.audienceTags.includes(tag));
    if (!hasTag) return false;
  }

  if (filters.freeOnly === true && !event.isFree) return false;

  return true;
}

/**
 * Applies the filters. An empty or absent filter matches everything, so the
 * caller can pass whatever the user has selected without special cases.
 */
export function filterEvents(events: readonly Event[], filters: EventFilters = {}): Event[] {
  return events.filter((event) => matches(event, filters));
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
