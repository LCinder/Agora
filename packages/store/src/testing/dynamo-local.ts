import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * A real DynamoDB for the isolation tests.
 *
 * The tests that matter most in this product are the ones that prove one
 * municipality cannot reach another's data (CLAUDE.md, section 10). A fake
 * in-memory client would prove nothing about them: half of the guarantee lives
 * in how DynamoDB itself answers a query on a sparse index, so the tests run
 * against DynamoDB Local.
 *
 * Three ways to get one, in order:
 *
 *   1. `DYNAMODB_ENDPOINT` — what the CI sets, pointing at a service container.
 *   2. Docker — what a developer's machine has.
 *   3. Neither: the suite skips with a message rather than failing, so a
 *      contributor without Docker can still run the rest of the tests.
 */
const run = promisify(execFile);

// Pinned to the version the CI runs, so a local pass means the same thing.
const IMAGE = 'amazon/dynamodb-local:3.3.1';
const PORT = 8000;

export interface LocalDynamo {
  endpoint: string;
  stop: () => Promise<void>;
}

/** Credentials DynamoDB Local accepts and ignores. */
export const LOCAL_CREDENTIALS = {
  accessKeyId: 'local',
  secretAccessKey: 'local',
};

async function reachable(endpoint: string): Promise<boolean> {
  try {
    // Any answer at all means something is listening and speaking HTTP. A bare
    // GET gets a 400 from DynamoDB, which is a perfectly good yes.
    await fetch(endpoint, { method: 'GET', signal: AbortSignal.timeout(2000) });

    return true;
  } catch {
    return false;
  }
}

async function waitUntilReachable(endpoint: string, attempts = 30): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await reachable(endpoint)) return true;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

/**
 * Returns an endpoint to test against, or null when there is no way to get one.
 */
export async function startDynamoLocal(): Promise<LocalDynamo | null> {
  const fromEnvironment = process.env['DYNAMODB_ENDPOINT'];

  if (fromEnvironment !== undefined && fromEnvironment !== '') {
    const ready = await waitUntilReachable(fromEnvironment);

    return ready ? { endpoint: fromEnvironment, stop: async () => {} } : null;
  }

  const name = `agora-dynamo-test-${process.pid}`;

  try {
    await run('docker', [
      'run',
      '--rm',
      '--detach',
      '--name',
      name,
      '--publish',
      `${PORT}:8000`,
      IMAGE,
      '-jar',
      'DynamoDBLocal.jar',
      '-inMemory',
    ]);
  } catch {
    return null;
  }

  const endpoint = `http://127.0.0.1:${PORT}`;

  if (!(await waitUntilReachable(endpoint))) {
    await run('docker', ['rm', '--force', name]).catch(() => undefined);

    return null;
  }

  return {
    endpoint,
    stop: async () => {
      await run('docker', ['rm', '--force', name]).catch(() => undefined);
    },
  };
}
