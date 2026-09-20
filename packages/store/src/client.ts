import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * The client every store is given.
 *
 * The document client is what the rest of this package talks to: it converts
 * plain JavaScript values to DynamoDB's attribute shapes, so nothing here has
 * to write `{ S: "..." }` by hand.
 *
 * `endpoint` exists for DynamoDB Local, which is what the isolation tests run
 * against. In a Lambda nothing is passed and the SDK picks up the region and
 * the role from the environment.
 */
export interface StoreClientOptions {
  region?: string;
  /** Only for DynamoDB Local, e.g. http://127.0.0.1:8000. */
  endpoint?: string;
  /**
   * Temporary credentials, when a request runs as somebody narrower than the
   * function's own role — the panel assumes one per municipality (D-057). The
   * session token is part of them: without it the SDK signs with a key that AWS
   * will refuse.
   */
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    expiration?: Date;
  };
}

export function createStoreClient(options: StoreClientOptions = {}): DynamoDBDocumentClient {
  const client = new DynamoDBClient({
    ...(options.region === undefined ? {} : { region: options.region }),
    ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
    ...(options.credentials === undefined ? {} : { credentials: options.credentials }),
  });

  return DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      // An absent value and a null one mean different things in this model:
      // `endAt: null` is "no announced end time", and dropping it would turn a
      // deliberate null into a missing attribute.
      removeUndefinedValues: true,
    },
  });
}

export type StoreClient = DynamoDBDocumentClient;
