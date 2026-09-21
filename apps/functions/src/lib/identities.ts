import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
  type AttributeType,
} from '@aws-sdk/client-cognito-identity-provider';

/**
 * Creating the account a person signs in with.
 *
 * The one thing Cognito is for here: answering "who are you". What that person
 * may do lives in the table, per municipality, and is written straight afterwards
 * as a membership (D-029). Which is why inviting somebody is one request from the
 * panel and two writes behind it — an account and a row — and why they have to
 * happen in that order: the membership names the Cognito subject.
 *
 * Nobody can sign themselves up: the user pool is `allow_admin_create_user_only`,
 * so this is the only door in, and only a municipal administrator may open it.
 */
export interface Identities {
  /**
   * The Cognito subject of an account for this email, creating it if needed.
   *
   * Cognito sends the invitation with a temporary password. An email that already
   * has an account is not an error: a technician who works for two neighbouring
   * town halls signs in once and holds two memberships.
   */
  invite(input: { email: string; fullName?: string }): Promise<string>;
}

function subjectOf(attributes: AttributeType[] | undefined): string | null {
  const found = (attributes ?? []).find((attribute) => attribute.Name === 'sub');

  return found?.Value ?? null;
}

let client: CognitoIdentityProviderClient | null = null;

export function createCognitoIdentities(userPoolId: string): Identities {
  client ??= new CognitoIdentityProviderClient({});

  const cognito = client;

  return {
    async invite({ email, fullName }) {
      const attributes: AttributeType[] = [
        { Name: 'email', Value: email },
        // Verified because the town hall is vouching for the address it typed, and
        // because an unverified account cannot reset its own password.
        { Name: 'email_verified', Value: 'true' },
      ];

      if (fullName !== undefined && fullName !== '') {
        attributes.push({ Name: 'custom:full_name', Value: fullName });
      }

      try {
        const created = await cognito.send(
          new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: email,
            UserAttributes: attributes,
            DesiredDeliveryMediums: ['EMAIL'],
          }),
        );

        const subject = subjectOf(created.User?.Attributes);

        if (subject === null) throw new Error('Cognito created a user with no subject.');

        return subject;
      } catch (thrown) {
        if (!(thrown instanceof UsernameExistsException)) throw thrown;

        const existing = await cognito.send(
          new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }),
        );

        const subject = subjectOf(existing.UserAttributes);

        if (subject === null) {
          throw new Error('Cognito knows that user but not its subject.', { cause: thrown });
        }

        return subject;
      }
    },
  };
}
