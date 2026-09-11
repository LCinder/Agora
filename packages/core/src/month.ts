import { TZDate } from '@date-fns/tz';
import { addDays, addMonths, endOfDay, getDay, startOfDay, startOfMonth } from 'date-fns';

import { byStartDate, occursWithin, type Event } from './event';

/**
 * The month view of the calendar.
 *
 * The list answers "what is on soon", which is what a resident opens the app
 * for. The month answers "what is on when I am free", which is what somebody
 * planning a weekend or a visit is actually asking, and it is the shape every
 * town hall already publishes its programme in.
 *
 * Built here, framework-free and tested, for the same reason the grouping is:
 * a calendar grid is fiddly around month ends, leap years and the resident who
 * opens the app from abroad, and none of that is something to debug through a
 * phone screen.
 */

/** Weeks start on Monday: this is a calendar for Spain. */
const MONDAY = 1;
const DAYS_IN_WEEK = 7;

export interface MonthDay {
  /** Midnight in the municipality time zone, as an absolute instant. */
  date: Date;
  /** Day of the month, 1-31. */
  dayOfMonth: number;
  /** False for the leading and trailing days borrowed from the months either side. */
  inMonth: boolean;
  isToday: boolean;
  /** Events happening on this day, earliest first. */
  events: Event[];
}

export interface MonthGrid {
  /** Midnight on the first day of the month being shown. */
  month: Date;
  /** Always whole weeks, Monday first, so the grid is rectangular. */
  weeks: MonthDay[][];
}

export interface MonthContext {
  now: Date;
  timeZone: string;
}

function zoned(instant: Date, timeZone: string): TZDate {
  return new TZDate(instant, timeZone);
}

/** How many days back from `date` the Monday of its week is. */
function daysSinceMonday(date: TZDate): number {
  return (getDay(date) - MONDAY + DAYS_IN_WEEK) % DAYS_IN_WEEK;
}

/**
 * The month `offset` months away from the one containing `instant`.
 *
 * Used by the arrows either side of the month name; kept here so the screen
 * never does date arithmetic of its own.
 */
export function shiftMonth(instant: Date, offset: number, timeZone: string): Date {
  return new Date(startOfMonth(addMonths(zoned(instant, timeZone), offset)).getTime());
}

/**
 * Lays a month out as whole weeks, each day carrying the events on it.
 *
 * An event spanning several days appears on each of them, which is what a grid
 * of days means; the list view is where an event appears once.
 *
 * Visibility is not decided here — callers pass the events their audience may
 * see, exactly as with `groupEvents`.
 */
export function buildMonthGrid(
  events: readonly Event[],
  context: MonthContext & { month: Date },
): MonthGrid {
  const { timeZone } = context;

  // Annotated: date-fns infers a plain Date through nested calls, and losing
  // the zone here would put the grid a day out for anyone abroad.
  const first: TZDate = startOfMonth(zoned(context.month, timeZone));
  const gridStart: TZDate = addDays(first, -daysSinceMonday(first));

  const last: TZDate = addDays(startOfMonth(addMonths(first, 1)), -1);
  const gridEnd: TZDate = addDays(last, DAYS_IN_WEEK - 1 - daysSinceMonday(last));

  const today = startOfDay(zoned(context.now, timeZone)).getTime();
  const monthNumber = first.getMonth();

  const weeks: MonthDay[][] = [];
  let week: MonthDay[] = [];

  for (let day = gridStart; day.getTime() <= gridEnd.getTime(); day = addDays(day, 1)) {
    const start = startOfDay(day);
    const range = { start: new Date(start.getTime()), end: new Date(endOfDay(day).getTime()) };

    week.push({
      date: new Date(start.getTime()),
      dayOfMonth: day.getDate(),
      inMonth: day.getMonth() === monthNumber,
      isToday: start.getTime() === today,
      events: events.filter((event) => occursWithin(event, range)).sort(byStartDate),
    });

    if (week.length === DAYS_IN_WEEK) {
      weeks.push(week);
      week = [];
    }
  }

  return { month: new Date(first.getTime()), weeks };
}

/** Flattens a grid back to a list of days, for finding one without nested loops. */
export function monthDays(grid: MonthGrid): MonthDay[] {
  return grid.weeks.flat();
}
