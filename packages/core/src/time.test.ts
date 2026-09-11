import { describe, expect, it } from 'vitest';

import { DEFAULT_TIME_ZONE } from './municipality';
import { dayRange, isSameDayInZone, minutesSince, weekendRange } from './time';

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
