import { describe, expect, it } from 'vitest';

import { formatLongDate, formatRelativeDay, formatTime, formatWhen } from './format';
import { DEFAULT_TIME_ZONE } from './municipality';

// Thursday 10 September 2026, 12:00 in Madrid.
const NOW = new Date('2026-09-10T10:00:00Z');
const ES = { now: NOW, timeZone: DEFAULT_TIME_ZONE, locale: 'es' } as const;
const EN = { now: NOW, timeZone: DEFAULT_TIME_ZONE, locale: 'en' } as const;

describe('formatTime', () => {
  it('shows the local wall clock time, not UTC', () => {
    expect(formatTime(new Date('2026-09-10T20:00:00Z'), ES)).toBe('22:00');
  });
});

describe('formatRelativeDay', () => {
  it('says today for an event later today', () => {
    expect(formatRelativeDay(new Date('2026-09-10T20:00:00Z'), ES)).toBe('Hoy');
    expect(formatRelativeDay(new Date('2026-09-10T20:00:00Z'), EN)).toBe('Today');
  });

  it('says tomorrow for the next day', () => {
    expect(formatRelativeDay(new Date('2026-09-11T16:00:00Z'), ES)).toBe('Mañana');
  });

  it('names the weekday further out', () => {
    expect(formatRelativeDay(new Date('2026-09-12T09:00:00Z'), ES)).toMatch(/sept?/i);
  });

  it('counts a late night event as today, in the municipality time zone', () => {
    // 23:30 in Madrid on Thursday is already Friday in UTC.
    expect(formatRelativeDay(new Date('2026-09-10T21:30:00Z'), ES)).toBe('Hoy');
  });
});

describe('formatWhen', () => {
  it('joins the day and the start time', () => {
    const when = formatWhen(
      { startAt: new Date('2026-09-10T20:00:00Z'), endAt: null, allDay: false },
      ES,
    );

    expect(when).toBe('Hoy · 22:00');
  });

  it('shows a time range when the event has an end', () => {
    const when = formatWhen(
      {
        startAt: new Date('2026-09-10T08:00:00Z'),
        endAt: new Date('2026-09-10T12:00:00Z'),
        allDay: false,
      },
      ES,
    );

    expect(when).toBe('Hoy · 10:00 – 14:00');
  });

  it('names the closing day for an event that runs past midnight', () => {
    const when = formatWhen(
      {
        startAt: new Date('2026-09-10T20:00:00Z'),
        endAt: new Date('2026-09-10T23:00:00Z'),
        allDay: false,
      },
      ES,
    );

    expect(when).toBe('Hoy · 22:00 – Mañana');
  });

  it('drops the time for an all day event', () => {
    const when = formatWhen(
      { startAt: new Date('2026-09-10T20:00:00Z'), endAt: null, allDay: true },
      ES,
    );

    expect(when).toBe('Hoy');
  });
});

describe('formatLongDate', () => {
  it('spells the date out in Spanish', () => {
    const label = formatLongDate(new Date('2026-09-12T09:00:00Z'), ES);

    expect(label).toContain('septiembre');
    expect(label).toContain('2026');
  });
});
