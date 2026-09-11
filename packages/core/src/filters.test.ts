import { describe, expect, it } from 'vitest';

import { eventsForMunicipality, filterEvents, residentVisibleEvents } from './filters';
import { makeEvent } from './test-fixtures';

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
