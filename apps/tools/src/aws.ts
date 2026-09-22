import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { fromIni } from '@aws-sdk/credential-provider-ini';

/**
 * What `fromIni` returns. Typed here rather than imported from `@smithy/types`,
 * which is a transitive dependency and not ours to depend on directly.
 */
/**
 * Credentials as every client in this package takes them: resolved, not a
 * provider. `fromIni` hands back a function that fetches them; a command that
 * runs for a few seconds wants the answer once, and the shape the store's own
 * options already declare.
 */
export interface Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date;
}

/**
 * Which credentials these commands run with, decided once.
 *
 * The default AWS chain reads the environment before it reads a profile, which
 * is the right order almost everywhere and the wrong one here: a laptop that
 * also works on somebody else's AWS accounts has an expired `AWS_SESSION_TOKEN`
 * lying about in half its terminals, and it silently beats a perfectly good
 * `~/.aws/credentials`. You then name a profile, the profile is never read, and
 * what comes back is "the security token included in the request is expired" —
 * a true sentence about credentials you were not trying to use.
 *
 * So when a profile is named, it wins outright: `fromIni` reads that profile and
 * the environment is not consulted at all. Nothing to unset, in any terminal,
 * ever.
 *
 * Where the profile comes from, in order:
 *
 *   1. `--profile` on the command.
 *   2. `AWS_PROFILE` in the environment.
 *   3. `.env` at the root of the repository, which is git-ignored and is the
 *      answer to "I do not want to type this every time".
 *
 * With none of the three, the ordinary chain applies, which is what CI wants:
 * there are no profiles there, only the role the job assumed.
 */

/** The repository root, from `apps/tools`. */
function repositoryRoot(): string {
  return join(process.cwd(), '..', '..');
}

let loaded = false;

/**
 * Reads `.env` at the root of the repository, once.
 *
 * `process.loadEnvFile` throws when the file is not there, which is the ordinary
 * case in CI and on a machine that never needed one.
 */
function loadRepositoryEnv(): void {
  if (loaded) return;

  loaded = true;

  for (const name of ['.env.local', '.env']) {
    const path = join(repositoryRoot(), name);

    if (!existsSync(path)) continue;

    try {
      process.loadEnvFile(path);
    } catch {
      // A malformed file should not stop a command that may not need it.
    }
  }

  dropMissingCredentialFiles();
}

/**
 * Forgets a credentials path that points at nothing.
 *
 * `.env` is one file and a laptop is often two shells. The paths that make the
 * AWS credentials reachable from WSL — `/mnt/c/Users/...` — are not paths at all
 * from Git Bash or PowerShell on the same machine, and an `AWS_CONFIG_FILE`
 * naming a file that does not exist does not fall back: the SDK looks there,
 * finds nothing, and reports that the profile does not exist.
 *
 * So a path that is not there is dropped, and the SDK goes back to `~/.aws`.
 * One `.env` then works from both shells, which is the whole point of having
 * put it in a file rather than typing it.
 */
function dropMissingCredentialFiles(): void {
  for (const variable of ['AWS_SHARED_CREDENTIALS_FILE', 'AWS_CONFIG_FILE']) {
    const path = process.env[variable];

    if (path !== undefined && path !== '' && !existsSync(path)) {
      delete process.env[variable];
    }
  }
}

/** The profile these commands should use, or null for the ordinary chain. */
export function resolveProfile(explicit: string | null): string | null {
  if (explicit !== null && explicit !== '') return explicit;

  loadRepositoryEnv();

  const fromEnvironment = process.env['AWS_PROFILE'];

  return fromEnvironment === undefined || fromEnvironment === '' ? null : fromEnvironment;
}

/**
 * Credentials for that profile, or undefined to let the SDK decide.
 *
 * Undefined and not a provider on purpose: every client in this package takes
 * this straight through, and handing the SDK `undefined` is how you say "do what
 * you would have done" — which is what CI wants, where there is no profile and
 * only the role the job assumed.
 */
export async function awsFrom(explicit: string | null): Promise<{
  profile: string | null;
  credentials: Credentials | undefined;
}> {
  const profile = resolveProfile(explicit);

  if (profile === null) return { profile, credentials: undefined };

  const resolved = await fromIni({ profile })();

  return {
    profile,
    credentials: {
      accessKeyId: resolved.accessKeyId,
      secretAccessKey: resolved.secretAccessKey,
      ...(resolved.sessionToken === undefined ? {} : { sessionToken: resolved.sessionToken }),
      ...(resolved.expiration === undefined ? {} : { expiration: resolved.expiration }),
    },
  };
}
