import { type StoreClient, createStoreClient } from '@agora/store';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';

/**
 * Making AWS refuse what the code already refuses.
 *
 * The isolation between municipalities is enforced three times already: the
 * partition key of everything names a municipality, so a query that does not name
 * one cannot be written (D-026); the stores are built around one actor and take no
 * municipality as an argument; and there are tests against a real DynamoDB that
 * try to cross the line and fail. This is the fourth, and the only one that does
 * not depend on our own code being right: the panel's request runs with
 * credentials that AWS itself will not let out of one municipality.
 *
 * It works by assuming a role with a **session policy** — a policy that can only
 * narrow what the role already allows — carrying `dynamodb:LeadingKeys` for that
 * municipality's partitions. A request for another town's rows comes back as an
 * access denied from DynamoDB, not as a decision of ours.
 *
 * What it does not cover, said plainly: the rows keyed by event (`EVT#`), by staff
 * user (`USER#`) and by volunteer code (`CODE#`) do not name a municipality in
 * their partition key, so no condition on that key can scope them. Those are the
 * ones the code guards by reading the event through its municipality first. What
 * this does add for them is a ceiling: the panel cannot touch a device row or the
 * platform index at all, because neither is in the policy.
 *
 * The credentials last an hour and are cached per municipality for the life of the
 * container, so this is one extra call to STS per municipality per cold start, not
 * one per request.
 */
const SESSION_MINUTES = 60;

/** Renewed before they expire rather than after a request has failed. */
const RENEW_BEFORE_MS = 5 * 60 * 1000;

/** Everything the panel does to an item. Scan is deliberately absent. */
const ITEM_ACTIONS = [
  'dynamodb:GetItem',
  'dynamodb:BatchGetItem',
  'dynamodb:Query',
  'dynamodb:PutItem',
  'dynamodb:UpdateItem',
  'dynamodb:DeleteItem',
  'dynamodb:BatchWriteItem',
  'dynamodb:ConditionCheckItem',
];

/**
 * The policy that travels with one request's credentials.
 *
 * Three statements, and the order they are read in matters less than what is
 * missing from them: `DEV#` and `PLATFORM` appear nowhere, so a panel cannot read
 * a device row however wrong the code goes.
 */
export function sessionPolicy(municipalityId: string, tableArn: string): string {
  const municipality = `MUN#${municipalityId}`;

  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'OwnMunicipality',
        Effect: 'Allow',
        Action: ITEM_ACTIONS,
        Resource: tableArn,
        Condition: {
          'ForAllValues:StringEquals': { 'dynamodb:LeadingKeys': [municipality] },
        },
      },
      {
        // The calendar and the review queue. Their partition key is the
        // municipality's with a suffix, so the same condition scopes them.
        Sid: 'OwnIndexes',
        Effect: 'Allow',
        Action: ['dynamodb:Query'],
        Resource: [`${tableArn}/index/gsi1`, `${tableArn}/index/gsi2`],
        Condition: {
          'ForAllValues:StringEquals': {
            'dynamodb:LeadingKeys': [`${municipality}#PUB`, `${municipality}#REVIEW`],
          },
        },
      },
      {
        // Rows whose partition key names something other than a municipality: an
        // event's notices and its live session, a staff user's memberships, a
        // volunteer code, the outbox. The code checks ownership of these by
        // reading the event through its municipality first.
        Sid: 'RowsNotKeyedByMunicipality',
        Effect: 'Allow',
        Action: ITEM_ACTIONS,
        Resource: tableArn,
        Condition: {
          'ForAllValues:StringLike': {
            'dynamodb:LeadingKeys': ['EVT#*', 'USER#*', 'CODE#*', 'OUTBOX'],
          },
        },
      },
    ],
  });
}

interface CachedClient {
  client: StoreClient;
  expiresAt: number;
}

const cache = new Map<string, CachedClient>();

let sts: STSClient | null = null;

/**
 * A client scoped to one municipality, or null where there is no role to assume.
 *
 * Null is the local case: the tests and a run against DynamoDB Local have no IAM
 * to narrow, and the caller falls back to the function's own client. In the cloud
 * Terraform always sets both variables, so null there would be a deployment
 * missing a variable rather than a mode.
 */
export async function scopedStoreClient(municipalityId: string): Promise<StoreClient | null> {
  const roleArn = process.env['PANEL_SESSION_ROLE_ARN'];
  const tableArn = process.env['TABLE_ARN'];

  if (roleArn === undefined || roleArn === '' || tableArn === undefined || tableArn === '') {
    return null;
  }

  const cached = cache.get(municipalityId);

  if (cached !== undefined && cached.expiresAt - RENEW_BEFORE_MS > Date.now()) {
    return cached.client;
  }

  sts ??= new STSClient({});

  const assumed = await sts.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      // Names the municipality, so CloudTrail says which town a call was made for
      // without anybody having to correlate anything.
      RoleSessionName: `panel-${municipalityId}`.slice(0, 64),
      Policy: sessionPolicy(municipalityId, tableArn),
      DurationSeconds: SESSION_MINUTES * 60,
    }),
  );

  const credentials = assumed.Credentials;

  if (
    credentials?.AccessKeyId === undefined ||
    credentials.SecretAccessKey === undefined ||
    credentials.SessionToken === undefined
  ) {
    throw new Error('STS returned no credentials for the panel session.');
  }

  const client = createStoreClient({
    credentials: {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
    },
  });

  cache.set(municipalityId, {
    client,
    expiresAt: credentials.Expiration?.getTime() ?? Date.now() + SESSION_MINUTES * 60 * 1000,
  });

  return client;
}

/** For the tests, which must not carry a cached client from one case to the next. */
export function forgetScopedClients(): void {
  cache.clear();
}
