import { describe, expect, it } from 'vitest';

import {
  activitiesOf,
  activitiesWithin,
  activityCategoryId,
  activityDefaults,
  activityHasOwnLocation,
  activityPrice,
  activitySchema,
  countByEvent,
  eventSpan,
  groupActivitiesByDay,
  isActivityAwaitingReview,
  isActivityVisible,
} from './activity';
import { makeActivity, makeEvent } from './test-fixtures';

const MADRID = 'Europe/Madrid';

describe('activitySchema', () => {
  it('refuses an activity that ends before it starts', () => {
    const parsed = activitySchema.safeParse({
      id: 'a',
      municipalityId: 'la-zubia',
      eventId: 'feria',
      title: 'Taller',
      startAt: '2026-09-11T18:00:00Z',
      endAt: '2026-09-11T17:00:00Z',
      status: 'published',
      createdAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-01T10:00:00Z',
    });

    expect(parsed.success).toBe(false);
  });

  it('refuses a rejected activity with no reason', () => {
    const parsed = activitySchema.safeParse({
      id: 'a',
      municipalityId: 'la-zubia',
      eventId: 'feria',
      title: 'Taller',
      startAt: '2026-09-11T18:00:00Z',
      status: 'rejected',
      createdAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-01T10:00:00Z',
    });

    expect(parsed.success).toBe(false);
  });

  it('inherits nothing by default, which is what the nulls mean', () => {
    const activity = makeActivity();

    expect(activity.categoryId).toBeNull();
    expect(activity.location).toBeNull();
    expect(activity.isFree).toBeNull();
    expect(activity.interestCount).toBe(0);
  });
});

describe('inheriting from the event', () => {
  const event = makeEvent({
    categoryId: 'fiestas',
    location: { name: 'Plaza Mayor', latitude: 37.1, longitude: -3.6 },
    isFree: true,
    priceInfo: null,
  });
  const defaults = activityDefaults(event);

  it('takes the event category when it has none of its own', () => {
    expect(activityCategoryId(makeActivity(), defaults)).toBe('fiestas');
    expect(activityCategoryId(makeActivity({ categoryId: 'infantil' }), defaults)).toBe('infantil');
  });

  it('takes the event price when it says nothing about money', () => {
    expect(activityPrice(makeActivity(), defaults)).toEqual({ isFree: true, priceInfo: null });
  });

  it('keeps its own price when it has one, including the free line of a paid event', () => {
    const paid = activityDefaults(makeEvent({ isFree: false, priceInfo: '8 € en taquilla' }));

    expect(activityPrice(makeActivity({ isFree: true }), paid)).toEqual({
      isFree: true,
      priceInfo: null,
    });
  });

  it('only calls a place its own when it differs from the event', () => {
    const same = makeActivity({
      location: { name: 'Plaza Mayor', latitude: 37.1, longitude: -3.6 },
    });
    const other = makeActivity({
      location: { name: 'Pabellón municipal', latitude: 37.1, longitude: -3.6 },
    });

    expect(activityHasOwnLocation(makeActivity(), defaults)).toBe(false);
    expect(activityHasOwnLocation(same, defaults)).toBe(false);
    expect(activityHasOwnLocation(other, defaults)).toBe(true);
  });
});

describe('isActivityVisible', () => {
  it('hides the whole programme of an event residents cannot see', () => {
    expect(isActivityVisible(makeActivity({ status: 'published' }), 'draft')).toBe(false);
    expect(isActivityVisible(makeActivity({ status: 'published' }), 'pending_review')).toBe(false);
  });

  it('shows published and cancelled lines of a visible event', () => {
    expect(isActivityVisible(makeActivity({ status: 'published' }), 'published')).toBe(true);
    expect(isActivityVisible(makeActivity({ status: 'cancelled' }), 'published')).toBe(true);
    // A cancelled feria still shows its programme: somebody has to be able to see
    // what is no longer happening.
    expect(isActivityVisible(makeActivity({ status: 'published' }), 'cancelled')).toBe(true);
  });

  it('hides a line waiting for the town hall', () => {
    expect(isActivityVisible(makeActivity({ status: 'pending_review' }), 'published')).toBe(false);
    expect(isActivityVisible(makeActivity({ status: 'draft' }), 'published')).toBe(false);
  });
});

describe('isActivityAwaitingReview', () => {
  it('counts a new line and an edit to a published one', () => {
    expect(isActivityAwaitingReview(makeActivity({ status: 'pending_review' }))).toBe(true);
    expect(
      isActivityAwaitingReview(
        makeActivity({ status: 'published', pendingPatch: { title: 'Otro título' } }),
      ),
    ).toBe(true);
    expect(isActivityAwaitingReview(makeActivity({ status: 'published' }))).toBe(false);
  });
});

describe('eventSpan', () => {
  it('leaves an event with no programme alone', () => {
    const event = makeEvent({ startAt: '2026-09-11T20:00:00Z', endAt: null });

    expect(eventSpan(event).endAt).toEqual(event.startAt);
  });

  it('stretches the end to cover the last activity', () => {
    const feria = makeEvent({ startAt: '2026-09-10T10:00:00Z', endAt: null });
    const span = eventSpan(feria, [
      makeActivity({ startAt: '2026-09-11T18:00:00Z' }),
      makeActivity({ id: 'a2', startAt: '2026-09-13T11:00:00Z', endAt: '2026-09-13T14:00:00Z' }),
    ]);

    expect(span.startAt).toEqual(feria.startAt);
    expect(span.endAt.toISOString()).toBe('2026-09-13T14:00:00.000Z');
  });

  it('never pulls the start backwards', () => {
    const feria = makeEvent({ startAt: '2026-09-10T10:00:00Z' });
    const span = eventSpan(feria, [makeActivity({ startAt: '2026-09-09T18:00:00Z' })]);

    expect(span.startAt).toEqual(feria.startAt);
  });
});

describe('activitiesOf', () => {
  it('keeps the lines of one event, in time order', () => {
    const mine = [
      makeActivity({ id: 'late', startAt: '2026-09-11T20:00:00Z' }),
      makeActivity({ id: 'early', startAt: '2026-09-11T11:00:00Z' }),
      makeActivity({ id: 'other', eventId: 'event-2', startAt: '2026-09-11T09:00:00Z' }),
    ];

    expect(activitiesOf(mine, 'event-1').map((activity) => activity.id)).toEqual(['early', 'late']);
  });
});

describe('countByEvent', () => {
  it('counts the programme of each event', () => {
    const counts = countByEvent([
      makeActivity({ id: 'a' }),
      makeActivity({ id: 'b' }),
      makeActivity({ id: 'c', eventId: 'event-2' }),
    ]);

    expect(counts.get('event-1')).toBe(2);
    expect(counts.get('event-2')).toBe(1);
    expect(counts.get('event-3')).toBeUndefined();
  });
});

describe('activitiesWithin', () => {
  it('finds what is on inside a range, both ends inclusive', () => {
    const day = { start: new Date('2026-09-11T00:00:00Z'), end: new Date('2026-09-11T23:59:59Z') };

    const found = activitiesWithin(
      [
        makeActivity({ id: 'today', startAt: '2026-09-11T18:00:00Z' }),
        makeActivity({ id: 'tomorrow', startAt: '2026-09-12T18:00:00Z' }),
        makeActivity({
          id: 'spanning',
          startAt: '2026-09-10T22:00:00Z',
          endAt: '2026-09-11T02:00:00Z',
        }),
      ],
      day,
    );

    expect(found.map((activity) => activity.id).sort()).toEqual(['spanning', 'today']);
  });
});

describe('groupActivitiesByDay', () => {
  it('breaks the programme into the days a poster would print', () => {
    const days = groupActivitiesByDay(
      [
        makeActivity({ id: 'sat-late', startAt: '2026-09-12T20:00:00Z' }),
        makeActivity({ id: 'fri', startAt: '2026-09-11T18:00:00Z' }),
        makeActivity({ id: 'sat-early', startAt: '2026-09-12T11:00:00Z' }),
      ],
      MADRID,
    );

    expect(days).toHaveLength(2);
    expect(days[0]?.activities.map((activity) => activity.id)).toEqual(['fri']);
    expect(days[1]?.activities.map((activity) => activity.id)).toEqual(['sat-early', 'sat-late']);
  });

  it('produces no day for a gap in the middle of a feria', () => {
    const days = groupActivitiesByDay(
      [
        makeActivity({ id: 'thu', startAt: '2026-09-10T18:00:00Z' }),
        makeActivity({ id: 'sat', startAt: '2026-09-12T18:00:00Z' }),
      ],
      MADRID,
    );

    expect(days).toHaveLength(2);
  });

  it('groups by the day in the town, not in UTC', () => {
    // 22:30 UTC in September is 00:30 the next day in Madrid, so this line falls
    // on the 12th for the neighbour and on the 11th for a server reading UTC. The
    // heading has to say what the poster says.
    const days = groupActivitiesByDay(
      [makeActivity({ id: 'verbena', startAt: '2026-09-11T22:30:00Z' })],
      MADRID,
    );

    expect(days).toHaveLength(1);
    expect(days[0]?.date.toISOString()).toBe('2026-09-11T22:00:00.000Z');
  });
});
