import {
  type AuditLog,
  type MembershipStore,
  type NoticeStore,
  type OrganizationStore,
  type StaffActor,
  type StaffStore,
  type StatsStore,
  type StoreClient,
  actorFrom,
  createAuditLog,
  createMembershipStore,
  createNoticeStore,
  createOrganizationStore,
  createStaffStore,
  createStatsStore,
} from '@agora/store';

import { type ApiEvent, forbidden } from './http';

/**
 * Everything a panel request runs against, built per request.
 *
 * The important line is `actorFrom(membership)`: the permissions come from the
 * table, never from the token (D-029). Cognito says who is calling; this reads
 * what that person may do in the municipality the path names, and if there is no
 * row, the answer is no. Removing a departing officer is deleting that row, with
 * nothing to wait for.
 *
 * Every store below is built with the same actor, so a request cannot reach past
 * its own municipality even by accident: none of them takes a municipality as an
 * argument.
 */
export interface PanelContext {
  actor: StaffActor;
  events: StaffStore;
  notices: NoticeStore;
  organizations: OrganizationStore;
  stats: StatsStore;
  audit: AuditLog;
  memberships: MembershipStore;
}

/** The Cognito subject the JWT authorizer already validated. */
export function callerSubject(event: ApiEvent): string | null {
  const claims = (
    event.requestContext as {
      authorizer?: { jwt?: { claims?: Record<string, unknown> } };
    }
  ).authorizer?.jwt?.claims;

  const subject = claims?.['sub'];

  return typeof subject === 'string' && subject !== '' ? subject : null;
}

export async function buildContext(
  client: StoreClient,
  tableName: string,
  subject: string,
  municipalityId: string,
): Promise<PanelContext> {
  const memberships = createMembershipStore(client, tableName);
  const membership = await memberships.get(subject, municipalityId);

  if (membership === null) {
    // The same answer whether the municipality does not exist, or exists and is
    // somebody else's: a panel user has no business learning which.
    throw forbidden('No tienes acceso a este municipio.');
  }

  const actor = actorFrom(membership);

  return {
    actor,
    events: createStaffStore(client, tableName, actor),
    notices: createNoticeStore(client, tableName, actor),
    organizations: createOrganizationStore(client, tableName, actor),
    stats: createStatsStore(client, tableName, actor),
    audit: createAuditLog(client, tableName, actor),
    memberships,
  };
}
