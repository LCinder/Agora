import type { CreateTableCommandInput } from '@aws-sdk/client-dynamodb';

/**
 * The shape of the table, for a test to create it with.
 *
 * `infra/terraform/modules/data` is the source of truth for the real table;
 * this is the same shape expressed for DynamoDB Local. Two copies of anything
 * drift, so `table-definition.test.ts` reads the Terraform and fails if they
 * stop matching — the whole reason this session exists is that the
 * infrastructure and the code had quietly disagreed.
 */
export const PARTITION_KEY = 'pk';
export const SORT_KEY = 'sk';
export const TTL_ATTRIBUTE = 'expiresAt';

export const INDEX_KEYS = {
  gsi1: { hash: 'gsi1pk', range: 'gsi1sk', projection: 'ALL' },
  gsi2: { hash: 'gsi2pk', range: 'gsi2sk', projection: 'ALL' },
  gsi3: { hash: 'gsi3pk', range: 'gsi3sk', projection: 'KEYS_ONLY' },
} as const;

export function createTableInput(tableName: string): CreateTableCommandInput {
  return {
    TableName: tableName,
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [
      { AttributeName: PARTITION_KEY, KeyType: 'HASH' },
      { AttributeName: SORT_KEY, KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: PARTITION_KEY, AttributeType: 'S' },
      { AttributeName: SORT_KEY, AttributeType: 'S' },
      ...Object.values(INDEX_KEYS).flatMap((index) => [
        { AttributeName: index.hash, AttributeType: 'S' as const },
        { AttributeName: index.range, AttributeType: 'S' as const },
      ]),
    ],
    GlobalSecondaryIndexes: Object.entries(INDEX_KEYS).map(([name, index]) => ({
      IndexName: name,
      KeySchema: [
        { AttributeName: index.hash, KeyType: 'HASH' as const },
        { AttributeName: index.range, KeyType: 'RANGE' as const },
      ],
      Projection: { ProjectionType: index.projection },
    })),
  };
}
