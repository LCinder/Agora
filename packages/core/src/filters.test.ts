import { describe, expect, it } from 'vitest';

import {
  eventsForMunicipality,
  filterEvents,
  matchingActivities,
  residentVisibleActivitiesFor,
  residentVisibleEvents,
} from './filters';
import { makeActivity, makeEvent } from './test-fixtures';

function ids(events: { id: string }[]): string[] {
  return events.map((event) => event.id);
}

describe('filterEvents', () => {
  const events = [
    makeEvent({ id: 'concert', categoryId: 'culture', isFree: false }),
    makeEvent({ id: 'mass', categoryId: 'religious', organizationId: 'brotherhood-1' }),
    makeEvent({ id: 'workshop', categoryId: 'culture', audienceTags: ['children'] }),
  ];

  it('returns everything when no filter is applied', () => {
    expect(filterEvents(events)).toHaveLength(3);
  });

  it('treats an empty selection as no filter at all', () => {
    expect(filterEvents(events, { categoryIds: [] })).toHaveLength(3);
  });

  it('filters by category', () => {
    expect(ids(filterEvents(events, { categoryIds: ['culture'] }))).toEqual([
      'concert',
      'workshop',
    ]);
  });

  it('filters by free entry', () => {
    expect(ids(filterEvents(events, { freeOnly: true }))).toEqual(['mass', 'workshop']);
  });

  it('filters by audience', () => {
    expect(ids(filterEvents(events, { audienceTags: ['children'] }))).toEqual(['workshop']);
  });

  it('filters by organisation, ignoring town hall events', () => {
    expect(ids(filterEvents(events, { organizationIds: ['brotherhood-1'] }))).toEqual(['mass']);
  });

  it('combines filters with and', () => {
    const result = filterEvents(events, { categoryIds: ['culture'], freeOnly: true });

    expect(ids(result)).toEqual(['workshop']);
  });
});

describe('filtering an event by what is inside it', () => {
  const feria = makeEvent({ id: 'feria', categoryId: 'fiestas', isFree: false });
  const programme = [
    makeActivity({ id: 'puppets', eventId: 'feria', categoryId: 'children' }),
    makeActivity({ id: 'joust', eventId: 'feria', categoryId: null }),
    makeActivity({ id: 'elsewhere', eventId: 'other', categoryId: 'children' }),
  ];

  it('keeps a feria whose programme has what the resident asked for', () => {
    expect(ids(filterEvents([feria], { categoryIds: ['children'] }, programme))).toEqual(['feria']);
  });

  it('drops it when nothing inside matches either', () => {
    expect(filterEvents([feria], { categoryIds: ['sport'] }, programme)).toHaveLength(0);
  });

  it('only counts the lines of that event', () => {
    expect(ids(matchingActivities(feria, programme, { categoryIds: ['children'] }))).toEqual([
      'puppets',
    ]);
  });

  it('says nothing when the filter is not about categories', () => {
    expect(matchingActivities(feria, programme, { freeOnly: true })).toEqual([]);
  });

  /**
   * A feria that charges at the gate is not free because the tombola inside it
   * is. A "Gratis" chip that returns things you have to pay to reach is worse
   * than one that returns fewer results.
   */
  it('never calls a paid event free because one of its lines is', () => {
    const free = [makeActivity({ id: 'tombola', eventId: 'feria', isFree: true })];

    expect(filterEvents([feria], { freeOnly: true }, free)).toHaveLength(0);
  });

  it('behaves as before for a caller that has not loaded the programme', () => {
    expect(filterEvents([feria], { categoryIds: ['children'] })).toHaveLength(0);
  });
});

describe('residentVisibleActivitiesFor', () => {
  it('drops the programme of an event the resident cannot see', () => {
    const events = [
      makeEvent({ id: 'published', status: 'published' }),
      makeEvent({ id: 'draft', status: 'draft' }),
    ];
    const activities = [
      makeActivity({ id: 'shown', eventId: 'published', status: 'published' }),
      makeActivity({ id: 'off', eventId: 'published', status: 'cancelled' }),
      makeActivity({ id: 'waiting', eventId: 'published', status: 'pending_review' }),
      // Published, and inside something nobody may see. This is the leak the
      // function exists to stop.
      makeActivity({ id: 'secret', eventId: 'draft', status: 'published' }),
      // No parent in the list at all: there is nothing to inherit from.
      makeActivity({ id: 'orphan', eventId: 'gone', status: 'published' }),
    ];

    expect(ids(residentVisibleActivitiesFor(activities, events))).toEqual(['shown', 'off']);
  });
});

describe('residentVisibleEvents', () => {
  it('never leaks events that are still waiting for approval', () => {
    const events = [
      makeEvent({ id: 'published', status: 'published' }),
      makeEvent({ id: 'pending', status: 'pending_review' }),
      makeEvent({ id: 'draft', status: 'draft' }),
      makeEvent({ id: 'cancelled', status: 'cancelled' }),
    ];

    expect(ids(residentVisibleEvents(events))).toEqual(['published', 'cancelled']);
  });
});

describe('eventsForMunicipality', () => {
  it('never returns an event from another municipality', () => {
    const events = [
      makeEvent({ id: 'here', municipalityId: 'la-zubia' }),
      makeEvent({ id: 'elsewhere', municipalityId: 'otura' }),
    ];

    expect(ids(eventsForMunicipality(events, 'la-zubia'))).toEqual(['here']);
  });
});
