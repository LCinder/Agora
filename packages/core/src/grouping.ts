import { activitiesOf, eventSpan, type Activity } from './activity';
import { byStartDate, type Event } from './event';
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
  /**
   * The programmes, when the caller has them.
   *
   * They only ever change where an event lands, never whether it is shown: a
   * feria that runs from Thursday to Sunday has to stay in "Hoy" on the Saturday,
   * and on its own dates it would fall into "Próximos" on Thursday evening and
   * never be seen again. Optional, so a screen that has not loaded them groups
   * on the events alone and is merely less right about long ones.
   */
  activities?: readonly Activity[];
}

/** Whether an event, programme included, overlaps a range. Both ends inclusive. */
function overlaps(
  span: { startAt: Date; endAt: Date },
  range: { start: Date; end: Date },
): boolean {
  return (
    span.startAt.getTime() <= range.end.getTime() && span.endAt.getTime() >= range.start.getTime()
  );
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
  const programme = context.activities ?? [];

  for (const event of events) {
    const span = eventSpan(event, activitiesOf(programme, event.id));

    if (span.endAt.getTime() < today.start.getTime()) {
      groups.past.push(event);
    } else if (overlaps(span, today)) {
      groups.today.push(event);
    } else if (overlaps(span, weekend)) {
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
