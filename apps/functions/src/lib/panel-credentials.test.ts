import { describe, expect, it } from 'vitest';

import { sessionPolicy } from './panel-credentials';

/**
 * The policy that travels with a panel request's credentials.
 *
 * What it allows cannot be tested here — that is AWS's answer to a call made with
 * these credentials, and IAM is not something DynamoDB Local has. What can be
 * tested is the document itself, and the document is the whole control: one wrong
 * leading key and either the panel breaks in production or the fourth layer of
 * isolation is not there.
 */
const TABLE = 'arn:aws:dynamodb:eu-central-1:123456789012:table/agora-prod';

function parse(municipalityId: string): {
  Statement: {
    Sid: string;
    Effect: string;
    Action: string[];
    Resource: string | string[];
    Condition: Record<string, Record<string, string[]>>;
  }[];
} {
  return JSON.parse(sessionPolicy(municipalityId, TABLE));
}

describe('the session policy of a panel request', () => {
  it('limits the table to the partitions of one municipality', () => {
    const own = parse('mun-zubia').Statement.find(
      (statement) => statement.Sid === 'OwnMunicipality',
    );

    expect(own?.Effect).toBe('Allow');
    expect(own?.Resource).toBe(TABLE);
    expect(own?.Condition['ForAllValues:StringEquals']?.['dynamodb:LeadingKeys']).toEqual([
      'MUN#mun-zubia',
    ]);
  });

  it('limits the calendar and the review queue to that municipality too', () => {
    const indexes = parse('mun-zubia').Statement.find(
      (statement) => statement.Sid === 'OwnIndexes',
    );

    expect(indexes?.Resource).toEqual([`${TABLE}/index/gsi1`, `${TABLE}/index/gsi2`]);
    expect(indexes?.Condition['ForAllValues:StringEquals']?.['dynamodb:LeadingKeys']).toEqual([
      'MUN#mun-zubia#PUB',
      'MUN#mun-zubia#REVIEW',
    ]);
  });

  it('never mentions another municipality', () => {
    const policy = sessionPolicy('mun-zubia', TABLE);

    expect(policy).toContain('MUN#mun-zubia');
    expect(policy).not.toContain('mun-otura');
    // A wildcard on the municipality's own key would make the whole thing
    // decorative, and it is the easy mistake to make while tidying this up.
    expect(policy).not.toContain('MUN#*');
  });

  it('leaves the devices and the platform index out altogether', () => {
    const policy = sessionPolicy('mun-zubia', TABLE);

    // Not denied: absent. Nothing in this document allows a panel to touch a
    // resident's row, which is the promise the privacy policy makes (D-029).
    expect(policy).not.toContain('DEV#');
    expect(policy).not.toContain('PLATFORM');
  });

  it('allows the rows whose partition key is not a municipality, and only those', () => {
    const others = parse('mun-zubia').Statement.find(
      (statement) => statement.Sid === 'RowsNotKeyedByMunicipality',
    );

    expect(others?.Condition['ForAllValues:StringLike']?.['dynamodb:LeadingKeys']).toEqual([
      'EVT#*',
      'USER#*',
      'CODE#*',
      'OUTBOX',
    ]);
  });

  it('asks for no permission to scan, whatever else it asks for', () => {
    expect(sessionPolicy('mun-zubia', TABLE)).not.toContain('Scan');
  });
});
