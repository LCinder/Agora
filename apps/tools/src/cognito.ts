import type { Credentials } from './aws';
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  type AttributeType,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';

/**
 * Getting somebody an account they can sign in with.
 *
 * Shared by the two commands that put people into a municipality, because both
 * face the same question and must answer it the same way: create-municipality
 * for the first administrator of a new town, add-admin for the first one of a
 * town that arrived through the seed.
 */

export interface Account {
  authUserId: string;
  created: boolean;
}

/**
 * The Cognito account the membership will point at.
 *
 * Created here rather than by the panel because there is nobody to invite the
 * first administrator: they are the first person who could have done it. An
 * address that already has an account is reused rather than refused — a town hall
 * officer who already works for the next town along is one person, and the
 * membership is what differs.
 */
export async function ensureAccount(
  userPoolId: string,
  email: string,
  fullName: string | null,
  dryRun: boolean,
  /** From the named profile, so a stale token in the environment cannot win. */
  credentials?: Credentials | undefined,
): Promise<Account> {
  const cognito = new CognitoIdentityProviderClient(
    credentials === undefined ? {} : { credentials },
  );

  const existing = await cognito
    .send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }))
    .catch(() => null);

  /** Cognito's own id for the account, which is what a membership points at. */
  const subOf = (attributes: AttributeType[] | undefined): string | null =>
    attributes?.find((attribute) => attribute.Name === 'sub')?.Value ?? null;

  if (existing !== null) {
    const sub = subOf(existing.UserAttributes);

    if (sub === null) throw new Error(`Cognito user ${email} has no sub.`);

    return { authUserId: sub, created: false };
  }

  if (dryRun) return { authUserId: 'dry-run-no-account-yet', created: false };

  try {
    const created = await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          // Verified because we are vouching for an address we were given by the
          // town hall, and because an unverified account cannot reset its own
          // password — which is the first thing this person will need to do.
          { Name: 'email_verified', Value: 'true' },
          ...(fullName === null || fullName === ''
            ? []
            : [{ Name: 'custom:full_name', Value: fullName }]),
        ],
        DesiredDeliveryMediums: ['EMAIL'],
      }),
    );

    const sub = subOf(created.User?.Attributes);

    if (sub === null) throw new Error(`Cognito created ${email} without a sub.`);

    return { authUserId: sub, created: true };
  } catch (error) {
    // Lost a race with somebody else running this. Read it back instead of
    // failing: the account is what we wanted and now it is there.
    if (error instanceof UsernameExistsException) {
      const again = await cognito.send(
        new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }),
      );
      const sub = subOf(again.UserAttributes);

      if (sub === null) {
        throw new Error(`Cognito user ${email} has no sub.`, { cause: error });
      }

      return { authUserId: sub, created: false };
    }

    throw error;
  }
}

/**
 * The account for an email, or nothing.
 *
 * Separate from `ensureAccount` because the two questions are different: that
 * one means "there must be one", this one means "is there one" — and the second
 * is what you ask before deleting.
 */
export async function findAccount(
  userPoolId: string,
  email: string,
  credentials?: Credentials | undefined,
): Promise<Account | null> {
  const cognito = new CognitoIdentityProviderClient(
    credentials === undefined ? {} : { credentials },
  );

  const existing = await cognito
    .send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }))
    .catch(() => null);

  if (existing === null) return null;

  const sub = existing.UserAttributes?.find((attribute) => attribute.Name === 'sub')?.Value ?? null;

  return sub === null ? null : { authUserId: sub, created: false };
}

/**
 * Deletes the account, and only the account.
 *
 * The memberships are what grant anything, so an account with none of them
 * already opens nothing: this is tidying, not security, and the caller has
 * already checked there is nothing left. Deliberately not something the panel
 * can do — its Cognito permissions are create and read, and a town hall has no
 * business deleting a person who also works for the next town along.
 */
export async function deleteAccount(
  userPoolId: string,
  email: string,
  credentials?: Credentials | undefined,
): Promise<void> {
  const cognito = new CognitoIdentityProviderClient(
    credentials === undefined ? {} : { credentials },
  );

  await cognito.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: email }));
}
