import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  INDEX_KEYS,
  PARTITION_KEY,
  SORT_KEY,
  TTL_ATTRIBUTE,
  createTableInput,
} from './table-definition';

/**
 * The table this package expects is the table Terraform creates.
 *
 * This test exists because of what it would have caught: the previous commit
 * left the infrastructure describing one thing and the application doing
 * another, in four different places. A definition duplicated for the tests is
 * exactly that risk again, so here the Terraform is read and compared.
 *
 * It is a deliberately shallow check — names of keys, indexes and projections —
 * because that is what a drift would break. Anything subtler belongs in a plan.
 */
const terraform = readFileSync(
  join(import.meta.dirname, '../../../infra/terraform/modules/data/main.tf'),
  'utf8',
);

describe('the table definition mirrors the Terraform', () => {
  it('uses the same partition and sort key', () => {
    expect(terraform).toContain(`hash_key     = "${PARTITION_KEY}"`);
    expect(terraform).toContain(`range_key    = "${SORT_KEY}"`);
  });

  it('declares the same attributes', () => {
    for (const index of Object.values(INDEX_KEYS)) {
      expect(terraform).toContain(`name = "${index.hash}"`);
      expect(terraform).toContain(`name = "${index.range}"`);
    }
  });

  it('declares the same indexes, with the same keys and projections', () => {
    for (const [name, index] of Object.entries(INDEX_KEYS)) {
      const block = terraform.split(`name            = "${name}"`)[1]?.slice(0, 200) ?? '';

      expect(block, `index ${name} is missing from the Terraform`).not.toBe('');
      expect(block).toContain(`hash_key        = "${index.hash}"`);
      expect(block).toContain(`range_key       = "${index.range}"`);
      expect(block).toContain(`projection_type = "${index.projection}"`);
    }
  });

  it('expires live positions through the same attribute', () => {
    expect(terraform).toContain(`attribute_name = "${TTL_ATTRIBUTE}"`);
  });

  it('builds a table with the three indexes', () => {
    const input = createTableInput('agora-test');

    expect(input.GlobalSecondaryIndexes?.map((index) => index.IndexName)).toEqual([
      'gsi1',
      'gsi2',
      'gsi3',
    ]);
  });
});
