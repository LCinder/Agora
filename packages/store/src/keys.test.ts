import { describe, expect, it } from 'vitest';

import {
  calendarIndexPk,
  eventKey,
  indexAttributesFor,
  interestKey,
  municipalityPk,
  reviewIndexPk,
} from './keys';

/**
 * The key design, without a database.
 *
 * These run everywhere, including on a machine with no Docker, and they cover
 * the property the isolation tests then prove end to end: what puts an event in
 * an index, and what keeps it out.
 */
const event = (status: string) => ({
  municipalityId: 'mun-zubia',
  status,
  startAt: new Date('2027-03-01T19:00:00.000Z'),
  createdAt: new Date('2027-01-01T10:00:00.000Z'),
});

describe('the partition key', () => {
  it('always names the municipality', () => {
    expect(municipalityPk('mun-zubia')).toBe('MUN#mun-zubia');
    expect(eventKey('mun-zubia', 'evt-1').pk).toBe('MUN#mun-zubia');
  });

  it('separates the calendar from the review queue', () => {
    expect(calendarIndexPk('mun-zubia')).toBe('MUN#mun-zubia#PUB');
    expect(reviewIndexPk('mun-zubia')).toBe('MUN#mun-zubia#REVIEW');
  });

  it('puts a resident mark under the device, not under the event', () => {
    const key = interestKey('device-one', 'mun-zubia', 'evt-1');

    expect(key.pk).toBe('DEV#device-one');
    expect(key.sk).toBe('INT#mun-zubia#evt-1');
  });
});

describe('the sparse indexes', () => {
  it('puts a published event in the calendar, ordered by start date', () => {
    const attributes = indexAttributesFor(event('published'));

    expect(attributes.gsi1pk).toBe('MUN#mun-zubia#PUB');
    expect(attributes.gsi1sk).toBe('2027-03-01T19:00:00.000Z');
    expect(attributes.gsi2pk).toBeUndefined();
  });

  it('keeps a cancelled event in the calendar, because finding out is the point', () => {
    expect(indexAttributesFor(event('cancelled')).gsi1pk).toBe('MUN#mun-zubia#PUB');
  });

  it('puts an event waiting for approval in the review queue and nowhere else', () => {
    const attributes = indexAttributesFor(event('pending_review'));

    expect(attributes.gsi2pk).toBe('MUN#mun-zubia#REVIEW');
    expect(attributes.gsi1pk).toBeUndefined();
  });

  it('leaves a draft and a rejected event out of both', () => {
    expect(indexAttributesFor(event('draft'))).toEqual({});
    expect(indexAttributesFor(event('rejected'))).toEqual({});
  });
});
