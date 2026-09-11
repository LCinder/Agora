import { TZDate } from '@date-fns/tz';
import {
  addDays,
  endOfDay,
  getDay,
  setHours,
  setMilliseconds,
  setMinutes,
  setSeconds,
  startOfDay,
} from 'date-fns';

/**
 * Every "today" and "this weekend" in the product is computed in the time zone
 * of the municipality, never in the time zone of the device. A neighbour
 * checking the app from abroad, and a test running in UTC, must both see the
 * same calendar the town hall published.
 */

export interface TimeRange {
  start: Date;
  end: Date;
}

const FRIDAY = 5;
const SATURDAY = 6;
const SUNDAY = 0;

function inZone(instant: Date, timeZone: string): TZDate {
  return new TZDate(instant, timeZone);
}

function plain(date: Date): Date {
  return new Date(date.getTime());
}

/** The calendar day containing `instant`, as seen from `timeZone`. */
export function dayRange(instant: Date, timeZone: string): TimeRange {
  const zoned = inZone(instant, timeZone);
  return { start: plain(startOfDay(zoned)), end: plain(endOfDay(zoned)) };
}

/**
 * The weekend residents care about right now.
 *
 * From Monday to Thursday it is the coming Friday to Sunday. Once the weekend
 * has started it is what is left of it, so the "Este finde" block never offers
 * days that already happened.
 */
export function weekendRange(instant: Date, timeZone: string): TimeRange {
  const zoned = inZone(instant, timeZone);
  const weekday = getDay(zoned);
  const weekendHasStarted = weekday === SUNDAY || weekday === FRIDAY || weekday === SATURDAY;

  const daysToStart = weekendHasStarted ? 0 : FRIDAY - weekday;
  const daysToEnd = weekday === SUNDAY ? 0 : 7 - weekday;

  return {
    start: plain(startOfDay(addDays(zoned, daysToStart))),
    end: plain(endOfDay(addDays(zoned, daysToEnd))),
  };
}

/** Whether two instants fall on the same calendar day in `timeZone`. */
export function isSameDayInZone(a: Date, b: Date, timeZone: string): boolean {
  return startOfDay(inZone(a, timeZone)).getTime() === startOfDay(inZone(b, timeZone)).getTime();
}

/** Minutes elapsed since `instant`, floored, never negative. */
export function minutesSince(instant: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - instant.getTime()) / 60_000));
}

/** A wall clock time of day, written as HH:mm. */
export const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Resolves a wall clock time into an instant.
 *
 * Used by the demo seed, whose events are anchored to "today" so the calendar
 * is never empty whenever the app is shown. Going through the municipality
 * time zone matters: 21:00 in La Zubia is a different instant in summer and in
 * winter, and the seed must not drift by an hour after the October clock
 * change.
 */
export function atLocalTime(
  reference: Date,
  dayOffset: number,
  timeOfDay: string,
  timeZone: string,
): Date {
  const match = TIME_OF_DAY_PATTERN.exec(timeOfDay);
  if (!match) {
    throw new Error(`Expected a time of day as HH:mm, got "${timeOfDay}"`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  const day = addDays(inZone(reference, timeZone), dayOffset);
  const at = setMilliseconds(setSeconds(setMinutes(setHours(day, hours), minutes), 0), 0);

  return plain(at);
}
