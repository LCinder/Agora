import { describe, expect, it } from 'vitest';

import { DEFAULT_TIME_ZONE } from './municipality';
import {
  atLocalTime,
  dayKeyInZone,
  dayRange,
  hourInZone,
  isSameDayInZone,
  minutesSince,
  nextDayRange,
  parseLocalDateTime,
  toLocalParts,
  weekendRange,
} from './time';

const MADRID = DEFAULT_TIME_ZONE;

describe('dayRange', () => {
  it('uses the municipality time zone, not the one of the machine', () => {
    // 22:30 UTC is already the next day in Madrid during summer time.
    const range = dayRange(new Date('2026-09-11T22:30:00Z'), MADRID);

    expect(range.start.toISOString()).toBe('2026-09-11T22:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-09-12T21:59:59.999Z');
  });
});

describe('weekendRange', () => {
  const friday = { start: '2026-09-10T22:00:00.000Z', end: '2026-09-13T21:59:59.999Z' };

  it('points at the coming weekend on a Monday', () => {
    const range = weekendRange(new Date('2026-09-07T10:00:00Z'), MADRID);

    expect(range.start.toISOString()).toBe(friday.start);
    expect(range.end.toISOString()).toBe(friday.end);
  });

  it('points at the coming weekend on a Thursday', () => {
    const range = weekendRange(new Date('2026-09-10T10:00:00Z'), MADRID);

    expect(range.start.toISOString()).toBe(friday.start);
    expect(range.end.toISOString()).toBe(friday.end);
  });

  it('starts today once Friday has arrived', () => {
    const range = weekendRange(new Date('2026-09-11T10:00:00Z'), MADRID);

    expect(range.start.toISOString()).toBe(friday.start);
    expect(range.end.toISOString()).toBe(friday.end);
  });

  it('drops Friday once Saturday has arrived', () => {
    const range = weekendRange(new Date('2026-09-12T10:00:00Z'), MADRID);

    expect(range.start.toISOString()).toBe('2026-09-11T22:00:00.000Z');
    expect(range.end.toISOString()).toBe(friday.end);
  });

  it('covers only Sunday on a Sunday', () => {
    const range = weekendRange(new Date('2026-09-13T10:00:00Z'), MADRID);

    expect(range.start.toISOString()).toBe('2026-09-12T22:00:00.000Z');
    expect(range.end.toISOString()).toBe(friday.end);
  });

  it('survives the end of summer time', () => {
    // Clocks go back on Sunday 25 October 2026, so the weekend starts at
    // UTC+2 and ends at UTC+1.
    const range = weekendRange(new Date('2026-10-23T10:00:00Z'), MADRID);

    expect(range.start.toISOString()).toBe('2026-10-22T22:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-10-25T22:59:59.999Z');
  });
});

describe('isSameDayInZone', () => {
  it('separates two instants that fall on different local days', () => {
    const lateNight = new Date('2026-09-11T21:00:00Z');
    const pastMidnight = new Date('2026-09-11T22:30:00Z');

    expect(isSameDayInZone(lateNight, pastMidnight, MADRID)).toBe(false);
    expect(isSameDayInZone(lateNight, pastMidnight, 'UTC')).toBe(true);
  });
});

describe('minutesSince', () => {
  it('floors the elapsed minutes', () => {
    const then = new Date('2026-09-11T20:00:00Z');

    expect(minutesSince(then, new Date('2026-09-11T20:04:59Z'))).toBe(4);
  });

  it('never reports negative time for a clock that drifted', () => {
    const then = new Date('2026-09-11T20:00:00Z');

    expect(minutesSince(then, new Date('2026-09-11T19:59:00Z'))).toBe(0);
  });
});

describe('atLocalTime', () => {
  it('resolves a wall clock time in the municipality time zone', () => {
    // Summer time: 21:00 in Madrid is 19:00 UTC.
    const instant = atLocalTime(new Date('2026-09-10T10:00:00Z'), 0, '21:00', MADRID);

    expect(instant.toISOString()).toBe('2026-09-10T19:00:00.000Z');
  });

  it('keeps the wall clock time across the end of summer time', () => {
    // Winter time: the same 21:00 is 20:00 UTC.
    const instant = atLocalTime(new Date('2026-10-23T10:00:00Z'), 5, '21:00', MADRID);

    expect(instant.toISOString()).toBe('2026-10-28T20:00:00.000Z');
  });

  it('walks forward across a month boundary', () => {
    const instant = atLocalTime(new Date('2026-09-29T10:00:00Z'), 3, '09:30', MADRID);

    expect(instant.toISOString()).toBe('2026-10-02T07:30:00.000Z');
  });

  it('rejects a malformed time', () => {
    expect(() => atLocalTime(new Date(), 0, '25:00', MADRID)).toThrow();
    expect(() => atLocalTime(new Date(), 0, '9:00', MADRID)).toThrow();
  });
});

describe('parseLocalDateTime and toLocalParts', () => {
  it('reads the wall clock time a municipal officer typed', () => {
    const instant = parseLocalDateTime('2026-09-12', '20:30', MADRID);

    expect(instant.toISOString()).toBe('2026-09-12T18:30:00.000Z');
  });

  it('applies winter time for a date after the October change', () => {
    const instant = parseLocalDateTime('2026-11-15', '20:30', MADRID);

    expect(instant.toISOString()).toBe('2026-11-15T19:30:00.000Z');
  });

  it('round trips through the form fields', () => {
    const instant = parseLocalDateTime('2027-01-05', '18:00', MADRID);

    expect(toLocalParts(instant, MADRID)).toEqual({ date: '2027-01-05', timeOfDay: '18:00' });
  });

  it('shows the local date for an instant that falls on another UTC day', () => {
    expect(toLocalParts(new Date('2026-09-11T22:30:00Z'), MADRID)).toEqual({
      date: '2026-09-12',
      timeOfDay: '00:30',
    });
  });

  it('rejects a malformed date', () => {
    expect(() => parseLocalDateTime('12/09/2026', '20:30', MADRID)).toThrow();
  });
});

describe('nextDayRange', () => {
  it('is the whole of tomorrow in the municipality time zone', () => {
    const range = nextDayRange(new Date('2026-09-11T21:30:00Z'), 'Europe/Madrid');

    expect(range.start.toISOString()).toBe('2026-09-11T22:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-09-12T21:59:59.999Z');
  });

  it('does not land on the same day when the clocks change', () => {
    // 25 October 2026, the night Spain goes back to winter time: adding 24 hours
    // to the evening of the 24th would still be the 25th.
    const range = nextDayRange(new Date('2026-10-24T18:00:00Z'), 'Europe/Madrid');

    expect(range.start.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-10-25T22:59:59.999Z');
  });
});

describe('hourInZone and dayKeyInZone', () => {
  it('read the clock of the municipality, not the clock of the server', () => {
    const instant = new Date('2026-09-11T23:30:00Z');

    expect(hourInZone(instant, 'Europe/Madrid')).toBe(1);
    expect(dayKeyInZone(instant, 'Europe/Madrid')).toBe('2026-09-12');
    expect(dayKeyInZone(instant, 'UTC')).toBe('2026-09-11');
  });
});
