import type { Event, EventCategory, Municipality, Organization } from '@agora/core';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';

import type { StoreClient } from './client';
import {
  categoryItem,
  eventWriteExpression,
  municipalityItem,
  municipalityPointerItem,
  organizationItem,
} from './items';
import {
  categoryKey,
  eventKey,
  municipalityIndexKey,
  municipalityKey,
  organizationKey,
} from './keys';

/**
 * Loads a municipality into the table.
 *
 * This is how a town hall is set up: its folder under `content/` becomes rows.
 * It is also the only way the table gets anything at all before the panel can
 * write to it, so until phase 2 is finished it is the bridge between the demo
 * and the real backend.
 *
 * It takes data rather than a data source on purpose: the seed files live in
 * `@agora/data`, and this package must not depend on them — the Lambdas import
 * this one, and a Lambda has no business carrying the events of a town that
 * exists only in a demo. The command line tool in `apps/tools` is what puts the
 * two together.
 *
 * Re-running it is safe, and that is the one property worth testing. Everything
 * is an upsert, and events go through the shared write expression, which never
 * touches `interestCount`: a second run over a table where residents have
 * already marked events keeps their counts. A `Put` would have zeroed them, and
 * nobody would have noticed until a town hall asked why an event that filled a
 * square shows nine interested.
 */
export interface MunicipalityBundle {
  municipality: Municipality;
  categories: EventCategory[];
  organizations: Organization[];
  events: Event[];
}

export interface MigrationResult {
  municipalities: number;
  categories: number;
  organizations: number;
  events: number;
}

export interface MigrationOptions {
  /** Log what would be written without writing it. */
  dryRun?: boolean;
  /** Called once per written row, for a command line tool to print progress. */
  onProgress?: (what: string) => void;
}

export async function migrateSeed(
  client: StoreClient,
  tableName: string,
  bundles: readonly MunicipalityBundle[],
  options: MigrationOptions = {},
): Promise<MigrationResult> {
  const { dryRun = false, onProgress } = options;
  const result: MigrationResult = {
    municipalities: 0,
    categories: 0,
    organizations: 0,
    events: 0,
  };

  /**
   * Writes one item as an upsert.
   *
   * `Put` for everything except events: a municipality, a category and an
   * association are ours to define, so overwriting them with what the seed says
   * is the intent. Events are the exception because of the counter.
   */
  async function put(key: { pk: string; sk: string }, item: Record<string, unknown>) {
    if (dryRun) return;

    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    const sets: string[] = [];

    for (const [field, value] of Object.entries(item)) {
      if (field === 'pk' || field === 'sk') continue;

      names[`#${field}`] = field;
      values[`:${field}`] = value;
      sets.push(`#${field} = :${field}`);
    }

    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    );
  }

  for (const bundle of bundles) {
    const { municipality, categories, organizations, events } = bundle;

    await put(municipalityKey(municipality.id), municipalityItem(municipality));
    await put(municipalityIndexKey(municipality.slug), municipalityPointerItem(municipality));
    result.municipalities += 1;
    onProgress?.(`municipality ${municipality.slug}`);

    for (const category of categories) {
      await put(categoryKey(municipality.id, category.id), categoryItem(municipality.id, category));
      result.categories += 1;
    }

    for (const organization of organizations) {
      await put(
        organizationKey(municipality.id, organization.id),
        organizationItem(municipality.id, organization),
      );
      result.organizations += 1;
    }

    for (const event of events) {
      if (!dryRun) {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: eventKey(municipality.id, event.id),
            // `create` because a migration is the one writer that may be
            // making the row rather than changing it.
            ...eventWriteExpression(event, { create: true }),
          }),
        );
      }

      result.events += 1;
    }

    onProgress?.(
      `${municipality.slug}: ${categories.length} categories, ${organizations.length} organizations, ${events.length} events`,
    );
  }

  return result;
}
