/**
 * Turning an AWS credentials failure into something you can act on.
 *
 * The SDK's own sentence is true and useless:
 *
 *     The security token included in the request is expired
 *
 * It says nothing about *which* credentials, and the answer is almost never the
 * ones you think you are using. Environment variables beat the profile in the
 * credential chain, so an `AWS_SESSION_TOKEN` left over from another account —
 * from work, from an SSO login that has since lapsed — silently wins over a
 * perfectly good `~/.aws/credentials`, and the profile you named is never read.
 *
 * Under WSL there is a second trap on top: `~` is the Linux home, so the
 * credentials file sitting in the Windows one is not there at all.
 *
 * Both cost an evening the first time. This is the note we would have wanted.
 */

/** The ways the SDK says "these credentials are no good". */
const CREDENTIAL_FAILURES = [
  'ExpiredToken',
  'ExpiredTokenException',
  'InvalidClientTokenId',
  'UnrecognizedClientException',
  'CredentialsProviderError',
  'AccessDenied',
  'security token',
  'Could not load credentials',
];

function looksLikeCredentials(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const haystack = `${error.name} ${error.message}`;

  return CREDENTIAL_FAILURES.some((needle) => haystack.includes(needle));
}

const ADVICE = `
AWS refused these credentials.

Most often that is not the profile you named: environment variables win over
~/.aws/credentials, so an expired AWS_SESSION_TOKEN from somewhere else is being
used instead. Check what is actually there:

  env | grep AWS
  aws sts get-caller-identity

and then:

  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
  export AWS_PROFILE=<your profile>

Running under WSL, ~ is the Linux home and the credentials file may live in the
Windows one. Point at it:

  export AWS_SHARED_CREDENTIALS_FILE=/mnt/c/Users/<you>/.aws/credentials
  export AWS_CONFIG_FILE=/mnt/c/Users/<you>/.aws/config
`.trim();

/**
 * What to print when a command dies. Returns the advice for a credentials
 * failure and the error's own message for everything else, because every other
 * failure here is already specific.
 */
export function explain(error: unknown): string {
  if (looksLikeCredentials(error)) {
    return `${error instanceof Error ? error.message : String(error)}\n\n${ADVICE}`;
  }

  return error instanceof Error ? error.message : String(error);
}
