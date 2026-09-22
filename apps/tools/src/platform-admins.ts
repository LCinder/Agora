import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

import type { Credentials } from './aws';

/**
 * The people who get a membership in every municipality, the moment it exists.
 *
 * Adding a town hall is one command. Before this, it was one command and then
 * one more per person who needs to reach it — and the cost of that is not the
 * typing, it is the day somebody forgets and a technician rings about a town
 * whose panel nobody here can open.
 *
 * What it writes are ordinary memberships: one row per person per municipality,
 * auditable one town at a time and revocable one town at a time. That is the
 * point. A role that crossed municipalities would remove the rows and with them
 * the property the whole design rests on — every request runs with credentials
 * pinned to the municipality in its path. This removes the chore instead.
 *
 * The list lives in Parameter Store rather than in a file here because the
 * repository is public and these are personal email addresses. It is not a
 * secret: it is plain text, and knowing it grants nothing.
 */

/** Where the list lives, given the table's environment. */
export function platformAdminsParameter(environment: string): string {
  return `/agora-${environment}/platform-admins`;
}

/**
 * Guesses the environment from the table name, so the command does not grow a
 * flag for something it already knows: the table is `agora-dev`, `agora-prod`.
 */
export function environmentOf(tableName: string): string | null {
  const match = /^agora-(.+)$/.exec(tableName);

  return match?.[1] ?? null;
}

let client: SSMClient | null = null;

/**
 * The emails on the list, or none.
 *
 * Empty for every reason it can be empty — no parameter, the placeholder, no
 * permission to read it — because none of them should stop a municipality being
 * created. The command says what it did either way, and a missing membership is
 * one `add-admin` away.
 */
export async function platformAdmins(input: {
  region: string;
  environment: string;
  credentials?: Credentials | undefined;
}): Promise<string[]> {
  client ??= new SSMClient(
    input.credentials === undefined
      ? { region: input.region }
      : { region: input.region, credentials: input.credentials },
  );

  const name = platformAdminsParameter(input.environment);

  let value: string;

  try {
    const answer = await client.send(new GetParameterCommand({ Name: name }));

    value = answer.Parameter?.Value ?? '';
  } catch {
    return [];
  }

  if (value === '' || value === 'PENDIENTE') return [];

  return value
    .split(',')
    .map((email) => email.trim())
    .filter((email) => email !== '');
}
