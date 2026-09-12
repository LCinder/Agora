import { describe, expect, it } from 'vitest';

import { buildMonthGrid, monthDays, shiftMonth } from './month';
import { DEFAULT_TIME_ZONE } from './municipality';
import { makeEvent } from './test-fixtures';

const MADRID = DEFAULT_TIME_ZONE;

// Thursday 10 September 2026, 12:00 in Madrid.
const THURSDAY = new Date('2026-09-10T10:00:00Z');

function grid(month: string, events: Parameters<typeof buildMonthGrid>[0] = []) {
  return buildMonthGrid(events, {
    now: THURSDAY,
    timeZone: MADRID,
    month: new Date(month),
  });
}

function labels(days: { dayOfMonth: number; inMonth: boolean }[]): string[] {
  return days.map((day) => `${day.inMonth ? '' : '·'}${day.dayOfMonth}`);
}

describe('buildMonthGrid', () => {
  it('lays the month out in whole weeks starting on Monday', () => {
    // September 2026 starts on a Tuesday and has 30 days.
    const september = grid('2026-09-01T00:00:00Z');

    expect(september.weeks).toHaveLength(5);
    for (const week of september.weeks) expect(week).toHaveLength(7);

    // Monday 31 August leads, Sunday 4 October trails.
    expect(labels(september.weeks[0]!)).toEqual(['·31', '1', '2', '3', '4', '5', '6']);
    expect(labels(september.weeks[4]!)).toEqual(['28', '29', '30', '·1', '·2', '·3', '·4']);
  });

  it('marks only the days of the month being shown as in-month', () => {
    const september = grid('2026-09-01T00:00:00Z');
    const inMonth = monthDays(september).filter((day) => day.inMonth);

    expect(inMonth).toHaveLength(30);
    expect(inMonth[0]!.dayOfMonth).toBe(1);
    expect(inMonth[29]!.dayOfMonth).toBe(30);
  });

  it('needs six weeks for a month that cannot fit in five', () => {
    // August 2026 starts on a Saturday and has 31 days.
    expect(grid('2026-08-01T00:00:00Z').weeks).toHaveLength(6);
  });

  it('puts each event on its day', () => {
    const events = [
      makeEvent({ id: 'friday', startAt: '2026-09-11T18:00:00Z' }),
      makeEvent({ id: 'saturday', startAt: '2026-09-12T11:00:00Z' }),
    ];

    const days = monthDays(grid('2026-09-01T00:00:00Z', events));

    expect(
      days.find((day) => day.dayOfMonth === 11 && day.inMonth)?.events.map((e) => e.id),
    ).toEqual(['friday']);
    expect(
      days.find((day) => day.dayOfMonth === 12 && day.inMonth)?.events.map((e) => e.id),
    ).toEqual(['saturday']);
    expect(days.find((day) => day.dayOfMonth === 13 && day.inMonth)?.events).toEqual([]);
  });

  it('orders the events of a day by start time', () => {
    const events = [
      makeEvent({ id: 'evening', startAt: '2026-09-12T18:00:00Z' }),
      makeEvent({ id: 'morning', startAt: '2026-09-12T09:00:00Z' }),
    ];

    const day = monthDays(grid('2026-09-01T00:00:00Z', events)).find(
      (candidate) => candidate.dayOfMonth === 12 && candidate.inMonth,
    );

    expect(day?.events.map((event) => event.id)).toEqual(['morning', 'evening']);
  });

  it('shows an event running over several days on each of them', () => {
    // 20:00 on the 18th to 23:00 on the 20th, in Madrid.
    const feria = makeEvent({
      id: 'feria',
      startAt: '2026-09-18T18:00:00Z',
      endAt: '2026-09-20T21:00:00Z',
    });

    const days = monthDays(grid('2026-09-01T00:00:00Z', [feria]));
    const withFeria = days
      .filter((day) => day.events.some((event) => event.id === 'feria'))
      .map((day) => day.dayOfMonth);

    expect(withFeria).toEqual([18, 19, 20]);
  });

  it('counts a night that runs past midnight on both days', () => {
    // 23:00 on the 20th to 01:30 on the 21st, in Madrid.
    const verbena = makeEvent({
      id: 'verbena',
      startAt: '2026-09-20T21:00:00Z',
      endAt: '2026-09-20T23:30:00Z',
    });

    const days = monthDays(grid('2026-09-01T00:00:00Z', [verbena]));
    const withVerbena = days
      .filter((day) => day.events.some((event) => event.id === 'verbena'))
      .map((day) => day.dayOfMonth);

    expect(withVerbena).toEqual([20, 21]);
  });

  it('marks today, and only today', () => {
    const days = monthDays(grid('2026-09-01T00:00:00Z')).filter((day) => day.isToday);

    expect(days).toHaveLength(1);
    expect(days[0]!.dayOfMonth).toBe(10);
  });

  it('marks no day as today when looking at another month', () => {
    expect(monthDays(grid('2026-11-01T00:00:00Z')).filter((day) => day.isToday)).toEqual([]);
  });

  it('places a late-evening event on the municipality day, not the UTC one', () => {
    // 23:30 on the 12th in Madrid is 21:30 UTC — still the 12th either way —
    // while 00:30 on the 13th in Madrid is 22:30 UTC on the 12th.
    const events = [makeEvent({ id: 'after-midnight', startAt: '2026-09-12T22:30:00Z' })];

    const days = monthDays(grid('2026-09-01T00:00:00Z', events));

    expect(days.find((day) => day.dayOfMonth === 13 && day.inMonth)?.events).toHaveLength(1);
    expect(days.find((day) => day.dayOfMonth === 12 && day.inMonth)?.events).toEqual([]);
  });

  it('handles February in a leap year', () => {
    const february = grid('2028-02-01T00:00:00Z');
    const inMonth = monthDays(february).filter((day) => day.inMonth);

    expect(inMonth).toHaveLength(29);
  });
});

describe('shiftMonth', () => {
  it('walks to the first day of the next month', () => {
    const next = shiftMonth(new Date('2026-09-10T10:00:00Z'), 1, MADRID);

    expect(buildMonthGrid([], { now: THURSDAY, timeZone: MADRID, month: next }).month).toEqual(
      next,
    );
    expect(monthDays(grid(next.toISOString())).filter((day) => day.inMonth)).toHaveLength(31);
  });

  it('crosses the end of the year in both directions', () => {
    const december = shiftMonth(new Date('2026-12-15T10:00:00Z'), 1, MADRID);
    expect(monthDays(grid(december.toISOString())).filter((day) => day.inMonth)).toHaveLength(31);

    const january = shiftMonth(new Date('2027-01-15T10:00:00Z'), -1, MADRID);
    expect(monthDays(grid(january.toISOString())).filter((day) => day.inMonth)).toHaveLength(31);
  });
});
