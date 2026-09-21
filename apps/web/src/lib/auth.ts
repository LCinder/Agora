'use client';

import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  type CognitoUserSession,
} from 'amazon-cognito-identity-js';

/**
 * Who is using the panel.
 *
 * Cognito answers that and nothing else: what this person may do comes from the
 * table, per municipality, and the API reads it on every request (D-029). So there
 * is no role in here, no municipality and no permission — only an email, and a
 * token to prove it.
 *
 * Three environment variables decide whether the panel has a backend at all. With
 * none of them — the demo build — everything here answers "not configured" and the
 * panel runs on the seed in the browser, which is what gets shown in a meeting.
 */
export interface PanelConfig {
  apiBaseUrl: string;
  userPoolId: string;
  clientId: string;
}

export function panelConfig(): PanelConfig | null {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? '';
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? '';

  if (apiBaseUrl === '' || userPoolId === '' || clientId === '') return null;

  return { apiBaseUrl, userPoolId, clientId };
}

let pool: CognitoUserPool | null = null;

function userPool(): CognitoUserPool | null {
  const config = panelConfig();

  if (config === null) return null;

  pool ??= new CognitoUserPool({ UserPoolId: config.userPoolId, ClientId: config.clientId });

  return pool;
}

export interface PanelIdentity {
  email: string;
}

/**
 * The user in the middle of the first-sign-in challenge.
 *
 * Kept here between the two steps because Cognito's SRP exchange is stateful: the
 * object that was handed the temporary password is the only one that can be handed
 * the new one.
 */
let pendingUser: CognitoUser | null = null;

export type SignInResult =
  | { status: 'signed-in'; identity: PanelIdentity }
  /** An invited person signing in for the first time, with the temporary password. */
  | { status: 'new-password-required' }
  | { status: 'failed'; message: string };

function identityOf(user: CognitoUser): PanelIdentity {
  return { email: user.getUsername() };
}

function messageFor(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;

  if (code === 'NotAuthorizedException' || code === 'UserNotFoundException') {
    // Cognito is configured to answer the same for both, and so do we: whether an
    // address has an account is not something a login form should tell anybody.
    return 'El correo o la contraseña no son correctos.';
  }

  if (code === 'PasswordResetRequiredException') {
    return 'Tienes que restablecer la contraseña. Pídele al ayuntamiento que te reenvíe la invitación.';
  }

  if (code === 'InvalidPasswordException') {
    return 'La contraseña necesita al menos 12 caracteres, con mayúsculas, minúsculas y números.';
  }

  return 'No hemos podido entrar. Inténtalo de nuevo.';
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const currentPool = userPool();

  if (currentPool === null) return { status: 'failed', message: 'El panel no tiene backend.' };

  const user = new CognitoUser({ Username: email, Pool: currentPool });

  return new Promise<SignInResult>((resolve) => {
    user.authenticateUser(new AuthenticationDetails({ Username: email, Password: password }), {
      onSuccess: () => resolve({ status: 'signed-in', identity: identityOf(user) }),
      onFailure: (error: unknown) => resolve({ status: 'failed', message: messageFor(error) }),
      newPasswordRequired: () => {
        pendingUser = user;
        resolve({ status: 'new-password-required' });
      },
    });
  });
}

/** The second half of a first sign-in: the password the person chooses. */
export async function completeNewPassword(password: string): Promise<SignInResult> {
  const user = pendingUser;

  if (user === null) {
    return { status: 'failed', message: 'Vuelve a introducir el correo y la contraseña temporal.' };
  }

  return new Promise<SignInResult>((resolve) => {
    user.completeNewPasswordChallenge(
      password,
      {},
      {
        onSuccess: () => {
          pendingUser = null;
          resolve({ status: 'signed-in', identity: identityOf(user) });
        },
        onFailure: (error: unknown) => resolve({ status: 'failed', message: messageFor(error) }),
      },
    );
  });
}

function session(user: CognitoUser): Promise<CognitoUserSession | null> {
  return new Promise((resolve) => {
    // Refreshes with the refresh token when the hour is up, and answers an error
    // when even that has expired — which is a signed-out person, not a fault.
    user.getSession((error: unknown, value: CognitoUserSession | null) => {
      resolve(error !== null && error !== undefined ? null : value);
    });
  });
}

/** Who is signed in on this browser, if anybody. Safe to call on every load. */
export async function currentIdentity(): Promise<PanelIdentity | null> {
  const user = userPool()?.getCurrentUser() ?? null;

  if (user === null) return null;

  return (await session(user)) === null ? null : identityOf(user);
}

/**
 * A valid token for the API, refreshed if it had expired.
 *
 * Handed to the panel client as a function rather than a value, so a panel left
 * open all afternoon in a town hall office keeps working.
 */
export async function currentIdToken(): Promise<string | null> {
  const user = userPool()?.getCurrentUser() ?? null;

  if (user === null) return null;

  const current = await session(user);

  return current === null ? null : current.getIdToken().getJwtToken();
}

export function signOut(): void {
  userPool()?.getCurrentUser()?.signOut();
  pendingUser = null;
}
