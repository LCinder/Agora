import { describe, expect, it } from 'vitest';

import { eventSchema, isAwaitingReview, isVisibleToResidents, occursWithin } from './event';
import { makeEvent } from './test-fixtures';

describe('eventSchema', () => {
  it('fills in the optional fields so the app never handles undefined', () => {
    const event = makeEvent();

    expect(event.organizationId).toBeNull();
    expect(event.endAt).toBeNull();
    expect(event.isFree).toBe(true);
    expect(event.audienceTags).toEqual([]);
    expect(event.description).toBe('');
  });

  it('parses dates coming from JSON seed files', () => {
    const event = makeEvent({ startAt: '2026-09-11T20:00:00Z' });

    expect(event.startAt).toBeInstanceOf(Date);
    expect(event.startAt.toISOString()).toBe('2026-09-11T20:00:00.000Z');
  });

  it('rejects an event that ends before it starts', () => {
    const result = eventSchema.safeParse({
      ...baseInput(),
      startAt: '2026-09-11T20:00:00Z',
      endAt: '2026-09-11T19:00:00Z',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a rejected event with no reason', () => {
    const result = eventSchema.safeParse({ ...baseInput(), status: 'rejected' });

    expect(result.success).toBe(false);
  });

  it('accepts a rejected event that says why', () => {
    const result = eventSchema.safeParse({
      ...baseInput(),
      status: 'rejected',
      rejectionReason: 'Falta el permiso de ocupación de la vía pública',
    });

    expect(result.success).toBe(true);
  });
});

describe('isVisibleToResidents', () => {
  it('shows published events', () => {
    expect(isVisibleToResidents({ status: 'published' })).toBe(true);
  });

  it('still shows cancelled events, so nobody turns up to nothing', () => {
    expect(isVisibleToResidents({ status: 'cancelled' })).toBe(true);
  });

  it('hides drafts, pending review and rejected events', () => {
    expect(isVisibleToResidents({ status: 'draft' })).toBe(false);
    expect(isVisibleToResidents({ status: 'pending_review' })).toBe(false);
    expect(isVisibleToResidents({ status: 'rejected' })).toBe(false);
  });
});

describe('isAwaitingReview', () => {
  it('only matches events waiting for the town hall', () => {
    expect(isAwaitingReview({ status: 'pending_review' })).toBe(true);
    expect(isAwaitingReview({ status: 'published' })).toBe(false);
  });
});

describe('occursWithin', () => {
  const range = {
    start: new Date('2026-09-11T00:00:00Z'),
    end: new Date('2026-09-11T23:59:59.999Z'),
  };

  it('matches an event that starts inside the range', () => {
    const event = makeEvent({ startAt: '2026-09-11T20:00:00Z' });

    expect(occursWithin(event, range)).toBe(true);
  });

  it('matches an event that merely overlaps the range', () => {
    const event = makeEvent({
      startAt: '2026-09-09T10:00:00Z',
      endAt: '2026-09-13T10:00:00Z',
    });

    expect(occursWithin(event, range)).toBe(true);
  });

  it('does not match an event that ends before the range', () => {
    const event = makeEvent({ startAt: '2026-09-10T10:00:00Z' });

    expect(occursWithin(event, range)).toBe(false);
  });
});

function baseInput() {
  return {
    id: 'event-1',
    municipalityId: 'la-zubia',
    title: 'Concierto en la plaza',
    categoryId: 'culture',
    startAt: '2026-09-11T20:00:00Z',
    location: { name: 'Plaza del Ayuntamiento', latitude: 37.1, longitude: -3.6 },
    status: 'published' as const,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  };
}
