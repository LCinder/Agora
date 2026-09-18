import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

/**
 * Reads a secret from Parameter Store, once per container.
 *
 * Terraform creates these parameters empty and never learns their value, so the
 * real secret lives only in Parameter Store and in the memory of a function that
 * needs it. A Lambda container serves many requests, so fetching on every one
 * would be a bill and a latency spike for no benefit — hence the cache, which
 * dies with the container.
 */
const cache = new Map<string, Promise<string>>();

let client: SSMClient | null = null;

function ssm(): SSMClient {
  client ??= new SSMClient({});

  return client;
}

export function readSecret(parameterName: string): Promise<string> {
  const cached = cache.get(parameterName);

  if (cached !== undefined) return cached;

  const fetched = ssm()
    .send(new GetParameterCommand({ Name: parameterName, WithDecryption: true }))
    .then((result) => {
      const value = result.Parameter?.Value;

      if (value === undefined || value === '' || value === 'PENDIENTE') {
        throw new Error(
          `The parameter ${parameterName} is empty. Fill it with the AWS CLI; see infra/terraform/README.md.`,
        );
      }

      return value;
    })
    .catch((error: unknown) => {
      // A failed read must not be cached: the parameter is usually filled in a
      // minute later, and a poisoned cache would keep the function broken until
      // the container is recycled.
      cache.delete(parameterName);

      throw error;
    });

  cache.set(parameterName, fetched);

  return fetched;
}

/** For tests, and for a local run against DynamoDB Local. */
export function primeSecret(parameterName: string, value: string): void {
  cache.set(parameterName, Promise.resolve(value));
}
