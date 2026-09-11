import { byStartDate, eventEndsAt, occursWithin, type Event } from './event';
import { dayRange, weekendRange } from './time';

/**
 * The shape of the home screen: what is on today, what is on this weekend and
 * what comes after. A resident opening the app should understand it without
 * touching a filter.
 */

export interface EventGroups {
  today: Event[];
  thisWeekend: Event[];
  upcoming: Event[];
  past: Event[];
}

export interface GroupingContext {
  now: Date;
  timeZone: string;
}

/**
 * Sorts events into the home screen blocks.
 *
 * Groups are mutually exclusive and ordered by priority: an event on today is
 * only in "today", even when today is a Saturday. Showing the same event twice
 * on one screen reads as a bug.
 *
 * Visibility is not decided here. Callers pass the events their audience is
 * allowed to see, so the same function serves residents and the town hall.
 */
export function groupEvents(events: readonly Event[], context: GroupingContext): EventGroups {
  const today = dayRange(context.now, context.timeZone);
  const weekend = weekendRange(context.now, context.timeZone);

  const groups: EventGroups = { today: [], thisWeekend: [], upcoming: [], past: [] };

  for (const event of events) {
    if (eventEndsAt(event).getTime() < today.start.getTime()) {
      groups.past.push(event);
    } else if (occursWithin(event, today)) {
      groups.today.push(event);
    } else if (occursWithin(event, weekend)) {
      groups.thisWeekend.push(event);
    } else {
      groups.upcoming.push(event);
    }
  }

  groups.today.sort(byStartDate);
  groups.thisWeekend.sort(byStartDate);
  groups.upcoming.sort(byStartDate);
  groups.past.sort((a, b) => byStartDate(b, a));

  return groups;
}
