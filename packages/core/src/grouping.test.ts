import { describe, expect, it } from 'vitest';

import { groupEvents } from './grouping';
import { DEFAULT_TIME_ZONE } from './municipality';
import { makeActivity, makeEvent } from './test-fixtures';

const MADRID = DEFAULT_TIME_ZONE;

// Thursday 10 September 2026, 12:00 in Madrid.
const THURSDAY = new Date('2026-09-10T10:00:00Z');

function ids(events: { id: string }[]): string[] {
  return events.map((event) => event.id);
}

describe('groupEvents', () => {
  it('splits events into today, this weekend and later', () => {
    const events = [
      makeEvent({ id: 'today-evening', startAt: '2026-09-10T18:00:00Z' }),
      makeEvent({ id: 'saturday', startAt: '2026-09-12T11:00:00Z' }),
      makeEvent({ id: 'next-week', startAt: '2026-09-17T18:00:00Z' }),
      makeEvent({ id: 'last-week', startAt: '2026-09-03T18:00:00Z' }),
    ];

    const groups = groupEvents(events, { now: THURSDAY, timeZone: MADRID });

    expect(ids(groups.today)).toEqual(['today-evening']);
    expect(ids(groups.thisWeekend)).toEqual(['saturday']);
    expect(ids(groups.upcoming)).toEqual(['next-week']);
    expect(ids(groups.past)).toEqual(['last-week']);
  });

  it('keeps an event in a single group when today is part of the weekend', () => {
    // Saturday 12 September, 12:00 in Madrid.
    const saturday = new Date('2026-09-12T10:00:00Z');
    const events = [
      makeEvent({ id: 'saturday', startAt: '2026-09-12T18:00:00Z' }),
      makeEvent({ id: 'sunday', startAt: '2026-09-13T11:00:00Z' }),
    ];

    const groups = groupEvents(events, { now: saturday, timeZone: MADRID });

    expect(ids(groups.today)).toEqual(['saturday']);
    expect(ids(groups.thisWeekend)).toEqual(['sunday']);
  });

  it('keeps an event that already started in today, not in the past', () => {
    const events = [
      makeEvent({
        id: 'ongoing',
        startAt: '2026-09-10T08:00:00Z',
        endAt: '2026-09-10T16:00:00Z',
      }),
    ];

    const groups = groupEvents(events, { now: THURSDAY, timeZone: MADRID });

    expect(ids(groups.today)).toEqual(['ongoing']);
    expect(groups.past).toHaveLength(0);
  });

  it('shows a multi-day fair in today while it is running', () => {
    const events = [
      makeEvent({
        id: 'feria',
        startAt: '2026-09-08T18:00:00Z',
        endAt: '2026-09-14T23:00:00Z',
      }),
    ];

    const groups = groupEvents(events, { now: THURSDAY, timeZone: MADRID });

    expect(ids(groups.today)).toEqual(['feria']);
  });

  it('treats an event with no end time as lasting until it starts', () => {
    const events = [makeEvent({ id: 'yesterday', startAt: '2026-09-09T18:00:00Z' })];

    const groups = groupEvents(events, { now: THURSDAY, timeZone: MADRID });

    expect(ids(groups.past)).toEqual(['yesterday']);
  });

  it('orders upcoming events chronologically and past ones most recent first', () => {
    const events = [
      makeEvent({ id: 'later', startAt: '2026-09-24T18:00:00Z' }),
      makeEvent({ id: 'sooner', startAt: '2026-09-17T18:00:00Z' }),
      makeEvent({ id: 'old', startAt: '2026-08-01T18:00:00Z' }),
      makeEvent({ id: 'recent', startAt: '2026-09-01T18:00:00Z' }),
    ];

    const groups = groupEvents(events, { now: THURSDAY, timeZone: MADRID });

    expect(ids(groups.upcoming)).toEqual(['sooner', 'later']);
    expect(ids(groups.past)).toEqual(['recent', 'old']);
  });

  it('uses the municipality time zone to decide what today means', () => {
    // 22:30 UTC on Thursday is already Friday in Madrid, so a Friday morning
    // event belongs to today rather than to the weekend block.
    const lateNight = new Date('2026-09-10T22:30:00Z');
    const events = [makeEvent({ id: 'friday-morning', startAt: '2026-09-11T08:00:00Z' })];

    const groups = groupEvents(events, { now: lateNight, timeZone: MADRID });

    expect(ids(groups.today)).toEqual(['friday-morning']);
    expect(groups.thisWeekend).toHaveLength(0);
  });

  /**
   * The case programmes exist for.
   *
   * A town hall types "Feria medieval, empieza el martes" and leaves the end
   * blank, because the end is on the poster as a list of activities. Without the
   * programme the feria falls out of "Hoy" on the Tuesday evening and is never
   * seen again while half of it is still to happen.
   */
  it('keeps a feria in today while its programme is still running', () => {
    const feria = makeEvent({ id: 'feria', startAt: '2026-09-08T18:00:00Z', endAt: null });
    const programme = [
      makeActivity({ id: 'tuesday', eventId: 'feria', startAt: '2026-09-08T19:00:00Z' }),
      makeActivity({ id: 'saturday', eventId: 'feria', startAt: '2026-09-12T19:00:00Z' }),
    ];

    expect(ids(groupEvents([feria], { now: THURSDAY, timeZone: MADRID }).past)).toEqual(['feria']);

    const groups = groupEvents([feria], {
      now: THURSDAY,
      timeZone: MADRID,
      activities: programme,
    });

    expect(ids(groups.today)).toEqual(['feria']);
    expect(groups.past).toHaveLength(0);
  });

  it('ignores the programme of another event', () => {
    const feria = makeEvent({ id: 'feria', startAt: '2026-09-08T18:00:00Z', endAt: null });
    const other = [
      makeActivity({ id: 'elsewhere', eventId: 'other', startAt: '2026-09-12T19:00:00Z' }),
    ];

    expect(
      ids(groupEvents([feria], { now: THURSDAY, timeZone: MADRID, activities: other }).past),
    ).toEqual(['feria']);
  });

  it('returns empty groups for an empty calendar', () => {
    const groups = groupEvents([], { now: THURSDAY, timeZone: MADRID });

    expect(groups).toEqual({ today: [], thisWeekend: [], upcoming: [], past: [] });
  });
});
