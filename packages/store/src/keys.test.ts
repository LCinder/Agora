import { describe, expect, it } from 'vitest';

import {
  activityIndexAttributesFor,
  activityInterestIndexPk,
  activityInterestKey,
  activityKey,
  activityPrefixFor,
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

describe('a line of a programme', () => {
  const activity = (status: string, parentStatus: string, pendingPatch: unknown = null) => ({
    ...event(status),
    parentStatus,
    pendingPatch,
  });

  it('lives under its municipality, with its event in the sort key', () => {
    const key = activityKey('mun-zubia', 'evt-feria', 'act-aves');

    expect(key.pk).toBe('MUN#mun-zubia');
    expect(key.sk).toBe('ACT#evt-feria#act-aves');
    // And one prefix returns exactly one programme.
    expect(key.sk.startsWith(activityPrefixFor('evt-feria'))).toBe(true);
    expect(key.sk.startsWith(activityPrefixFor('evt-otra'))).toBe(false);
  });

  it('puts a resident mark under the device, naming both the event and the line', () => {
    const key = activityInterestKey('device-one', 'mun-zubia', 'evt-feria', 'act-aves');

    expect(key.pk).toBe('DEV#device-one');
    expect(key.sk).toBe('IAC#mun-zubia#evt-feria#act-aves');
    // Its own prefix, so "borrar mis datos" can tell the two kinds of mark apart
    // without counting hashes in a key.
    expect(key.sk.startsWith('INT#')).toBe(false);
  });

  it('files the mark under the line and not under the event', () => {
    expect(activityInterestIndexPk('act-aves')).toBe('ACT#act-aves');
    expect(activityInterestIndexPk('act-aves')).not.toBe('EVT#act-aves');
  });

  /**
   * The property this whole file exists for, applied to programmes: an activity
   * is only ever as public as the event it hangs off.
   */
  it('stays out of the calendar while its event is not public', () => {
    expect(activityIndexAttributesFor(activity('published', 'draft')).gsi1pk).toBeUndefined();
    expect(
      activityIndexAttributesFor(activity('published', 'pending_review')).gsi1pk,
    ).toBeUndefined();
    expect(activityIndexAttributesFor(activity('published', 'rejected')).gsi1pk).toBeUndefined();
  });

  it('enters the calendar when both it and its event are public', () => {
    const attributes = activityIndexAttributesFor(activity('published', 'published'));

    expect(attributes.gsi1pk).toBe('MUN#mun-zubia#PUB');
    expect(attributes.gsi1sk).toBe('2027-03-01T19:00:00.000Z');
    expect(attributes.gsi2pk).toBeUndefined();
  });

  it('keeps a cancelled line on the programme of a cancelled event', () => {
    expect(activityIndexAttributesFor(activity('cancelled', 'cancelled')).gsi1pk).toBe(
      'MUN#mun-zubia#PUB',
    );
  });

  it('puts a line waiting for approval in the review queue and nowhere else', () => {
    const attributes = activityIndexAttributesFor(activity('pending_review', 'published'));

    expect(attributes.gsi2pk).toBe('MUN#mun-zubia#REVIEW');
    expect(attributes.gsi1pk).toBeUndefined();
  });

  /**
   * A published line with an edit waiting is in both, and that is correct: the
   * neighbours read it, and the town hall has to decide on it. What they read is
   * what is on the row — the change lives in `pendingPatch` and touches nothing
   * until it is approved.
   */
  it('is in both indexes when a published line has a change waiting', () => {
    const attributes = activityIndexAttributesFor(
      activity('published', 'published', { title: 'Otro título' }),
    );

    expect(attributes.gsi1pk).toBe('MUN#mun-zubia#PUB');
    expect(attributes.gsi2pk).toBe('MUN#mun-zubia#REVIEW');
  });

  it('leaves a draft and a rejected line out of both', () => {
    expect(activityIndexAttributesFor(activity('draft', 'published'))).toEqual({});
    expect(activityIndexAttributesFor(activity('rejected', 'published'))).toEqual({});
  });
});
