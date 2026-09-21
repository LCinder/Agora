import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import type { StoreClient } from './client';
import { forbidden } from './errors';
import { AUDIT_PREFIX, auditKey, municipalityPk } from './keys';
import type { StaffActor } from './staff-store';

/**
 * Who did what, in which municipality.
 *
 * Not a feature anybody asked for: it is what a town hall's secretary asks for
 * when they read the data protection paperwork, and what answers "who cancelled
 * the verbena" three weeks later. It is append only — there is no method here
 * that edits or deletes a line, which is the whole point of a log.
 *
 * It is written by the API after an operation succeeds, rather than by each
 * store. The stores enforce permissions; this records requests, and requests are
 * what the API has.
 */
export interface AuditEntry {
  id: string;
  municipalityId: string;
  actorId: string;
  /** Dotted and in the past: `event.publish`, `organization.trust`. */
  action: string;
  entity: string;
  entityId: string;
  createdAt: Date;
}

export interface AuditLog {
  record(entry: { action: string; entity: string; entityId: string }): Promise<void>;
  /** Newest first. Municipal administrators only. */
  list(options?: { limit?: number }): Promise<AuditEntry[]>;
}

export function createAuditLog(
  client: StoreClient,
  tableName: string,
  actor: StaffActor,
): AuditLog {
  return {
    async record(entry) {
      const createdAt = new Date();
      const id = crypto.randomUUID();

      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            ...auditKey(actor.municipalityId, createdAt, id),
            entity: 'audit',
            id,
            municipalityId: actor.municipalityId,
            actorId: actor.authUserId,
            action: entry.action,
            target: entry.entity,
            entityId: entry.entityId,
            createdAt: createdAt.toISOString(),
          },
        }),
      );
    },

    async list(options = {}) {
      if (actor.role !== 'municipal_admin') {
        throw forbidden('El registro de actividad es del responsable municipal.');
      }

      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
          ExpressionAttributeValues: {
            ':pk': municipalityPk(actor.municipalityId),
            ':prefix': AUDIT_PREFIX,
          },
          // Backwards, because a log is read from now.
          ScanIndexForward: false,
          Limit: options.limit ?? 100,
        }),
      );

      return (result.Items ?? []).map((item) => ({
        id: String(item['id']),
        municipalityId: String(item['municipalityId']),
        actorId: String(item['actorId']),
        action: String(item['action']),
        entity: String(item['target']),
        entityId: String(item['entityId']),
        createdAt: new Date(String(item['createdAt'])),
      }));
    },
  };
}
