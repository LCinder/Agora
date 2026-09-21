import {
  type EventCategory,
  type Municipality,
  type MunicipalitySettings,
  municipalitySchema,
} from '@agora/core';
import { GetCommand, PutCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

import type { StoreClient } from './client';
import { categoryItem, municipalityItem, municipalityPointerItem } from './items';
import {
  categoryKey,
  membershipKey,
  municipalMemberKey,
  municipalityIndexKey,
  municipalityKey,
} from './keys';

/**
 * Setting up a town hall. The superadmin's only job, and the one thing the panel
 * cannot do.
 *
 * It is deliberately **not exported from `@agora/store`**. Reaching it means
 * importing `@agora/store/onboarding` on purpose, which no Lambda does and none
 * should: writing the first administrator of a municipality is the one operation
 * with no actor to check, because the person it creates is the first person who
 * could have authorised it. A method on the membership store would have been a
 * hole in every permission check in the product; a separate entry point that only
 * a command line tool imports is a door with nobody behind it.
 *
 * Everything it writes is conditional. A slug already taken stops the whole
 * thing before a single row is written, because that slug points at a real town
 * hall's calendar and overwriting it is the worst mistake available here.
 */
export interface NewMunicipality {
  id: string;
  slug: string;
  name: string;
  province: string;
  population: number;
  ineCode: string;
  latitude: number;
  longitude: number;
  primaryColor: string;
  logoUrl?: string | null;
  status?: Municipality['status'];
  features?: Municipality['features'];
  settings?: Partial<MunicipalitySettings>;
}

/**
 * The first person who can sign in.
 *
 * `authUserId` comes from Cognito, so the account exists before this runs: a
 * membership pointing at nobody is an invitation that can never be accepted.
 */
export interface Founder {
  authUserId: string;
  email: string;
  fullName?: string;
}

export interface OnboardingResult {
  municipality: Municipality;
  categories: number;
}

export class SlugTaken extends Error {
  constructor(slug: string) {
    super(`A municipality already uses the slug "${slug}".`);
    this.name = 'SlugTaken';
  }
}

export class AlreadyOnboarded extends Error {
  constructor(id: string) {
    super(`The municipality "${id}" already exists.`);
    this.name = 'AlreadyOnboarded';
  }
}

export interface OnboardingOptions {
  /** Checks everything and writes nothing. */
  dryRun?: boolean;
  onProgress?: (what: string) => void;
}

/**
 * Creates a municipality, its categories and its first administrator.
 *
 * @param categories The categories to give it, usually the shared six. They are
 *   passed in rather than read from disk because this package holds no data — the
 *   caller is the one that knows where `content/` is.
 */
export async function onboardMunicipality(
  client: StoreClient,
  tableName: string,
  input: NewMunicipality,
  founder: Founder,
  categories: readonly EventCategory[],
  options: OnboardingOptions = {},
): Promise<OnboardingResult> {
  const { dryRun = false, onProgress } = options;

  // Parsed before anything is checked, so a bad colour or a five-digit code that
  // is not five digits fails here rather than halfway through the writes.
  const municipality = municipalitySchema.parse({
    ...input,
    status: input.status ?? 'pilot',
    branding: { primaryColor: input.primaryColor, logoUrl: input.logoUrl ?? null },
    settings: input.settings ?? {},
    features: input.features ?? [],
  });

  if (founder.email.trim() === '' || founder.authUserId.trim() === '') {
    throw new Error('The first administrator needs an account and an email.');
  }

  const taken = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: municipalityIndexKey(municipality.slug),
      // `id`, not `municipalityId`: the pointer row carries the municipality
      // flattened into it, so the field is spelled the way the municipality
      // spells it. Reading the wrong name here would make every slug look free.
      ProjectionExpression: 'id',
    }),
  );

  // A slug is what a shared link and a QR code resolve through, so one already in
  // use belongs to a town hall whose calendar is live.
  if (taken.Item !== undefined && taken.Item['id'] !== municipality.id) {
    throw new SlugTaken(municipality.slug);
  }

  const existing = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: municipalityKey(municipality.id),
      ProjectionExpression: 'pk',
    }),
  );

  if (existing.Item !== undefined) throw new AlreadyOnboarded(municipality.id);

  onProgress?.(`municipality ${municipality.slug} (${municipality.name})`);

  for (const category of categories) {
    onProgress?.(`category ${category.slug}`);
  }

  onProgress?.(`first administrator ${founder.email}`);

  if (dryRun) return { municipality, categories: categories.length };

  const createdAt = new Date();
  const membership = {
    entity: 'membership',
    authUserId: founder.authUserId,
    municipalityId: municipality.id,
    role: 'municipal_admin' as const,
    organizationId: null,
    email: founder.email,
    fullName: founder.fullName ?? '',
    createdAt: createdAt.toISOString(),
  };

  // One transaction for the town hall itself: the municipality, the slug that
  // resolves to it and the person who can sign in. Half of this is not a
  // municipality — a row with no pointer is invisible, a pointer with no row is a
  // broken link, and either without the membership is a calendar nobody can edit.
  //
  // The conditions repeat the checks above on purpose. Those read; these hold.
  await client.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: { ...municipalityKey(municipality.id), ...municipalityItem(municipality) },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              ...municipalityIndexKey(municipality.slug),
              ...municipalityPointerItem(municipality),
            },
            ConditionExpression: 'attribute_not_exists(sk)',
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: { ...membershipKey(founder.authUserId, municipality.id), ...membership },
            ConditionExpression: 'attribute_not_exists(sk)',
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: { ...municipalMemberKey(municipality.id, founder.authUserId), ...membership },
            ConditionExpression: 'attribute_not_exists(sk)',
          },
        },
      ],
    }),
  );

  // Afterwards, and not in the transaction: DynamoDB takes a hundred items at
  // most, and a municipality with a missing category is a dropdown with a gap
  // rather than a town hall that does not work. Run it again and they appear.
  for (const category of categories) {
    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          ...categoryKey(municipality.id, category.id),
          ...categoryItem(municipality.id, category),
        },
      }),
    );
  }

  return { municipality, categories: categories.length };
}
