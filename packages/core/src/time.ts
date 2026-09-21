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
 * The calendar day after the one containing `instant`, as seen from `timeZone`.
 *
 * What the evening reminder is about: run at seven, tell people what happens
 * tomorrow. Through `addDays` on a zoned date and not by adding 24 hours, which
 * lands on the same day twice a year when the clocks change.
 */
export function nextDayRange(instant: Date, timeZone: string): TimeRange {
  const tomorrow = addDays(inZone(instant, timeZone), 1);

  return { start: plain(startOfDay(tomorrow)), end: plain(endOfDay(tomorrow)) };
}

/** The hour of the day, 0 to 23, as read from a clock in `timeZone`. */
export function hourInZone(instant: Date, timeZone: string): number {
  return inZone(instant, timeZone).getHours();
}

/** The calendar month in `timeZone`, as `2026-04`. Used to key the monthly series. */
export function monthKeyInZone(instant: Date, timeZone: string): string {
  const zoned = inZone(instant, timeZone);

  return `${zoned.getFullYear()}-${String(zoned.getMonth() + 1).padStart(2, '0')}`;
}

/** The calendar day in `timeZone`, as `2026-04-03`. Used to key daily counters. */
export function dayKeyInZone(instant: Date, timeZone: string): string {
  const zoned = inZone(instant, timeZone);
  const month = String(zoned.getMonth() + 1).padStart(2, '0');
  const day = String(zoned.getDate()).padStart(2, '0');

  return `${zoned.getFullYear()}-${month}-${day}`;
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

/** A calendar date written as YYYY-MM-DD. */
export const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Builds an instant from the date and time a municipal officer typed.
 *
 * The panel form deals in wall clock time in the municipality, which is what
 * the poster says and what the neighbour will read. Converting through the
 * time zone here is what keeps an event created in July from drifting an hour
 * once the clocks change.
 */
export function parseLocalDateTime(date: string, timeOfDay: string, timeZone: string): Date {
  const dateMatch = DATE_PATTERN.exec(date);
  if (!dateMatch) {
    throw new Error(`Expected a date as YYYY-MM-DD, got "${date}"`);
  }

  const [, year, month, day] = dateMatch;
  const noon = new TZDate(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0, timeZone);

  return atLocalTime(plain(noon), 0, timeOfDay, timeZone);
}

/** The inverse: the date and time to show in the panel form. */
export function toLocalParts(instant: Date, timeZone: string): { date: string; timeOfDay: string } {
  const zoned = inZone(instant, timeZone);

  const pad = (value: number) => String(value).padStart(2, '0');

  return {
    date: `${zoned.getFullYear()}-${pad(zoned.getMonth() + 1)}-${pad(zoned.getDate())}`,
    timeOfDay: `${pad(zoned.getHours())}:${pad(zoned.getMinutes())}`,
  };
}
