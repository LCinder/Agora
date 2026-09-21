import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

import type { StoreClient } from './client';
import { forbidden, notFound } from './errors';
import {
  MEMBERSHIP_PREFIX,
  membershipKey,
  membershipPk,
  municipalMemberKey,
  municipalityPk,
} from './keys';
import type { StaffActor, StaffRole } from './staff-store';

/**
 * Who a person is allowed to be, in which municipality.
 *
 * This is the table that turns a Cognito identity into permissions, and the
 * reason permissions never travel inside the token (D-029): a role belongs to a
 * municipality, and a Cognito group knows nothing about municipalities. The
 * practical gain is that removing a departing officer's access is deleting one
 * row, not waiting for a JWT to expire.
 *
 * A person can hold more than one: we hold one per municipality we support, and
 * a technician who works for two neighbouring town halls holds two.
 */
export interface Membership {
  authUserId: string;
  municipalityId: string;
  role: StaffRole;
  /** Set for `org_editor`: the association this person speaks for. */
  organizationId: string | null;
  email: string;
  fullName: string;
  createdAt: Date;
}

/** What the API builds every request from. */
export function actorFrom(membership: Membership): StaffActor {
  return {
    authUserId: membership.authUserId,
    municipalityId: membership.municipalityId,
    role: membership.role,
    organizationId: membership.organizationId,
  };
}

export interface NewMembership {
  authUserId: string;
  role: StaffRole;
  organizationId?: string | null;
  email: string;
  fullName?: string;
}

export interface MembershipStore {
  /** Every municipality this person may work in. */
  listForUser(authUserId: string): Promise<Membership[]>;
  /**
   * Everybody with access to a municipality, for the screen that manages them.
   *
   * Municipal staff only — an association has no business knowing who else works
   * for the town hall — and the check is here rather than in the handler.
   */
  listForMunicipality(actor: StaffActor): Promise<Membership[]>;
  get(authUserId: string, municipalityId: string): Promise<Membership | null>;
  /** Municipal administrators only, and only for their own municipality. */
  grant(actor: StaffActor, membership: NewMembership): Promise<Membership>;
  revoke(actor: StaffActor, authUserId: string): Promise<void>;
}

function toMembership(item: Record<string, unknown>): Membership {
  return {
    authUserId: String(item['authUserId']),
    municipalityId: String(item['municipalityId']),
    role: String(item['role']) as StaffRole,
    organizationId: item['organizationId'] === null ? null : String(item['organizationId']),
    email: String(item['email'] ?? ''),
    fullName: String(item['fullName'] ?? ''),
    createdAt: new Date(String(item['createdAt'])),
  };
}

export function createMembershipStore(client: StoreClient, tableName: string): MembershipStore {
  async function get(authUserId: string, municipalityId: string): Promise<Membership | null> {
    const result = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: membershipKey(authUserId, municipalityId),
      }),
    );

    return result.Item === undefined ? null : toMembership(result.Item);
  }

  /**
   * Only an administrator of that same municipality may hand out access.
   *
   * There is no check against granting something above your own level, because
   * the type makes it impossible: `StaffRole` has no `superadmin`, which is ours
   * and lives nowhere a town hall can reach.
   */
  function assertMayGrant(actor: StaffActor): void {
    if (actor.role !== 'municipal_admin') {
      throw forbidden('Solo un responsable municipal da de alta usuarios.');
    }
  }

  return {
    async listForUser(authUserId) {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
          ExpressionAttributeValues: {
            ':pk': membershipPk(authUserId),
            ':prefix': MEMBERSHIP_PREFIX,
          },
        }),
      );

      return (result.Items ?? []).map(toMembership);
    },

    get,

    async listForMunicipality(actor) {
      if (actor.role !== 'municipal_editor' && actor.role !== 'municipal_admin') {
        throw forbidden('Quién tiene acceso lo ve el ayuntamiento.');
      }

      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
          ExpressionAttributeValues: {
            ':pk': municipalityPk(actor.municipalityId),
            ':prefix': MEMBERSHIP_PREFIX,
          },
        }),
      );

      return (result.Items ?? []).map(toMembership);
    },

    async grant(actor, membership) {
      assertMayGrant(actor);

      if (membership.role === 'org_editor' && !membership.organizationId) {
        throw forbidden('El responsable de una asociación necesita su asociación.');
      }

      const created: Membership = {
        authUserId: membership.authUserId,
        // Never from the input: the municipality is the one the granting
        // administrator belongs to, so there is no request shape that reaches
        // another town hall.
        municipalityId: actor.municipalityId,
        role: membership.role,
        organizationId: membership.organizationId ?? null,
        email: membership.email,
        fullName: membership.fullName ?? '',
        createdAt: new Date(),
      };

      const item = {
        entity: 'membership',
        ...created,
        createdAt: created.createdAt.toISOString(),
      };

      // Both rows or neither: the mirror under the municipality is what the panel
      // reads to show who has access, and one written without the other would
      // either hide somebody who can log in or list somebody who cannot.
      await client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: tableName,
                Item: { ...membershipKey(created.authUserId, created.municipalityId), ...item },
              },
            },
            {
              Put: {
                TableName: tableName,
                Item: {
                  ...municipalMemberKey(created.municipalityId, created.authUserId),
                  ...item,
                },
              },
            },
          ],
        }),
      );

      return created;
    },

    async revoke(actor, authUserId) {
      if (actor.role !== 'municipal_admin') {
        throw forbidden('Solo un responsable municipal quita usuarios.');
      }

      if (authUserId === actor.authUserId) {
        throw forbidden('No puedes quitarte a ti mismo el acceso.');
      }

      const existing = await get(authUserId, actor.municipalityId);

      if (existing === null) {
        throw notFound('Esa persona no tiene acceso a este municipio.');
      }

      await client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Delete: {
                TableName: tableName,
                Key: membershipKey(authUserId, actor.municipalityId),
              },
            },
            {
              Delete: {
                TableName: tableName,
                Key: municipalMemberKey(actor.municipalityId, authUserId),
              },
            },
          ],
        }),
      );
    },
  };
}
