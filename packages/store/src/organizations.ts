import { type Organization, organizationSchema } from '@agora/core';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import type { StoreClient } from './client';
import { forbidden, notFound } from './errors';
import { SK_PREFIX, municipalityPk, organizationKey } from './keys';
import type { StaffActor } from './staff-store';

/**
 * The associations of a municipality: hermandades, peñas, clubs, AMPAs.
 *
 * They are the differentiator of the whole product — the calendar fills itself
 * because they fill it — and the two levers the town hall has over them are
 * here: whether an association exists at all, and whether it is trusted enough
 * to publish without review.
 *
 * Both levers are the town hall's alone. An association cannot create itself,
 * cannot trust itself, and cannot see the others: it reads its own row and
 * nothing else.
 */
export interface NewOrganization {
  id?: string;
  name: string;
  type: Organization['type'];
  contactEmail: string | null;
}

export interface OrganizationStore {
  list(): Promise<Organization[]>;
  get(organizationId: string): Promise<Organization | null>;
  /** Municipal administrators only. The association starts as `invited`. */
  create(organization: NewOrganization): Promise<Organization>;
  /** The lever that keeps the review queue short. Municipal administrators only. */
  setTrusted(organizationId: string, isTrusted: boolean): Promise<Organization>;
  setStatus(organizationId: string, status: Organization['status']): Promise<Organization>;
}

export function createOrganizationStore(
  client: StoreClient,
  tableName: string,
  actor: StaffActor,
): OrganizationStore {
  const municipalityId = actor.municipalityId;

  function assertAdmin(): void {
    if (actor.role !== 'municipal_admin') {
      throw forbidden('Solo un responsable municipal gestiona las asociaciones.');
    }
  }

  async function read(organizationId: string): Promise<Organization | null> {
    const result = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: organizationKey(municipalityId, organizationId),
      }),
    );

    return result.Item === undefined ? null : organizationSchema.parse(result.Item);
  }

  async function patch(
    organizationId: string,
    field: 'isTrusted' | 'status',
    value: boolean | string,
  ): Promise<Organization> {
    assertAdmin();

    if ((await read(organizationId)) === null) {
      throw notFound('Esa asociación no existe en este municipio.');
    }

    const result = await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: organizationKey(municipalityId, organizationId),
        UpdateExpression: 'SET #field = :value',
        ExpressionAttributeNames: { '#field': field },
        ExpressionAttributeValues: { ':value': value },
        ConditionExpression: 'attribute_exists(pk)',
        ReturnValues: 'ALL_NEW',
      }),
    );

    return organizationSchema.parse(result.Attributes);
  }

  return {
    async list() {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
          ExpressionAttributeValues: {
            ':pk': municipalityPk(municipalityId),
            ':prefix': SK_PREFIX.organization,
          },
        }),
      );

      const organizations = (result.Items ?? []).map((item) => organizationSchema.parse(item));

      // An association sees itself and nobody else. Who else is on the platform
      // is the town hall's business, not a peña's.
      return actor.organizationId === null
        ? organizations
        : organizations.filter((organization) => organization.id === actor.organizationId);
    },

    async get(organizationId) {
      if (actor.organizationId !== null && actor.organizationId !== organizationId) {
        return null;
      }

      return read(organizationId);
    },

    async create(organization) {
      assertAdmin();

      if (organization.name.trim() === '') {
        throw forbidden('Una asociación necesita nombre.');
      }

      const created: Organization = {
        id: organization.id ?? crypto.randomUUID(),
        municipalityId,
        name: organization.name.trim(),
        type: organization.type,
        contactEmail: organization.contactEmail,
        // Never trusted on creation: trust is something the town hall grants
        // after seeing what an association publishes, and defaulting it the
        // other way would make the review queue optional by accident.
        isTrusted: false,
        status: 'invited',
        logoUrl: null,
      };

      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            ...organizationKey(municipalityId, created.id),
            entity: 'organization',
            ...created,
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );

      return created;
    },

    setTrusted(organizationId, isTrusted) {
      return patch(organizationId, 'isTrusted', isTrusted);
    },

    setStatus(organizationId, status) {
      return patch(organizationId, 'status', status);
    },
  };
}
