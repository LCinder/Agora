import { eventCategorySchema } from '@agora/core';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { type StoreClient, createStoreClient } from './client';
import { actorFrom, createMembershipStore } from './memberships';
import {
  AlreadyAMember,
  AlreadyOnboarded,
  NoSuchMunicipality,
  SlugTaken,
  addAdministrator,
  onboardMunicipality,
} from './onboarding';
import { createPublicStore } from './public-store';
import { LOCAL_CREDENTIALS, type LocalDynamo, startDynamoLocal } from './testing/dynamo-local';
import { ZUBIA, createTable, dropTable, seed } from './testing/fixtures';

/**
 * Setting up a town hall.
 *
 * The thing worth proving is not that the rows appear — it is that the town hall
 * is **usable** afterwards: the slug resolves, the categories are there, and the
 * person named can sign in and act as an administrator without anybody granting
 * them anything. That is the whole point of the operation, and the three ways it
 * can half-work are a row with no pointer, a pointer with no row, and a calendar
 * nobody can edit.
 */
const local: LocalDynamo | null = await startDynamoLocal();
const TABLE = `agora-onboarding-${process.pid}`;

/** Two of the six shared ones, which is what the command line tool passes in. */
const CATEGORIES = [
  eventCategorySchema.parse({
    id: 'fiestas',
    municipalityId: null,
    slug: 'fiestas',
    name: 'Fiestas',
    icon: 'sparkles',
    color: '#C2410C',
  }),
  eventCategorySchema.parse({
    id: 'cultura',
    municipalityId: null,
    slug: 'cultura',
    name: 'Cultura',
    icon: 'book',
    color: '#1D4ED8',
  }),
];

const HUETOR = {
  id: 'mun-huetor-vega',
  slug: 'huetor-vega',
  name: 'Huétor Vega',
  province: 'Granada',
  population: 12_000,
  ineCode: '18101',
  latitude: 37.1258,
  longitude: -3.5846,
  primaryColor: '#1D4ED8',
};

const ANA = { authUserId: 'auth-ana', email: 'alcaldia@huetorvega.es', fullName: 'Ana Ruiz' };

describe.skipIf(local === null)('setting up a municipality', () => {
  let client: StoreClient;

  beforeEach(async () => {
    client = createStoreClient({
      region: 'eu-central-1',
      endpoint: local?.endpoint ?? '',
      credentials: LOCAL_CREDENTIALS,
    });

    await dropTable(client, TABLE);
    await createTable(client, TABLE);
    await seed(client, TABLE);
  });

  afterAll(async () => {
    await dropTable(client, TABLE);
  });

  it('leaves a town hall its first administrator can actually use', async () => {
    const result = await onboardMunicipality(client, TABLE, HUETOR, ANA, CATEGORIES);

    expect(result.municipality.status).toBe('pilot');
    // Defaults the caller never has to think about: the evening reminder and the
    // anti-spam cap arrive set, because a municipality without them would send
    // reminders at midnight or none at all.
    expect(result.municipality.settings).toEqual({ reminderHour: 19, maxDailyNotifications: 3 });

    const publicStore = createPublicStore(client, TABLE);

    // The slug is what a shared link and a QR code resolve through. Without the
    // pointer the town exists and nothing can reach it.
    expect((await publicStore.getMunicipalityBySlug('huetor-vega'))?.id).toBe(HUETOR.id);
    expect((await publicStore.listCategories(HUETOR.id)).map((one) => one.slug)).toEqual([
      'cultura',
      'fiestas',
    ]);

    const memberships = createMembershipStore(client, TABLE);
    const mine = await memberships.listForUser(ANA.authUserId);

    expect(mine).toHaveLength(1);
    expect(mine[0]?.role).toBe('municipal_admin');

    // The real test: she can do an administrator's job without anybody granting
    // her anything, which is what makes this the bootstrap and not an invitation.
    const staff = await memberships.listForMunicipality(actorFrom(mine[0]!));

    expect(staff.map((one) => one.email)).toEqual([ANA.email]);
  });

  it('refuses a slug that belongs to somebody else, before writing anything', async () => {
    await expect(
      onboardMunicipality(
        client,
        TABLE,
        { ...HUETOR, id: 'mun-otro', slug: 'la-zubia' },
        ANA,
        CATEGORIES,
      ),
    ).rejects.toThrow(SlugTaken);

    // La Zubia's own pointer still points at La Zubia. This is the mistake that
    // would take a live town hall's calendar away from it.
    const pointer = await client.send(
      new GetCommand({ TableName: TABLE, Key: { pk: 'PLATFORM', sk: 'MUN#la-zubia' } }),
    );

    expect(pointer.Item?.['id']).toBe(ZUBIA);

    const memberships = createMembershipStore(client, TABLE);

    expect(await memberships.listForUser(ANA.authUserId)).toEqual([]);
  });

  it('refuses to run twice', async () => {
    await onboardMunicipality(client, TABLE, HUETOR, ANA, CATEGORIES);

    await expect(onboardMunicipality(client, TABLE, HUETOR, ANA, CATEGORIES)).rejects.toThrow(
      AlreadyOnboarded,
    );
  });

  it('checks everything and writes nothing on a dry run', async () => {
    const seen: string[] = [];

    const result = await onboardMunicipality(client, TABLE, HUETOR, ANA, CATEGORIES, {
      dryRun: true,
      onProgress: (what) => seen.push(what),
    });

    expect(result.categories).toBe(2);
    // It says what it would do, which is the only reason to run it.
    expect(seen).toHaveLength(4);

    expect(await createPublicStore(client, TABLE).getMunicipalityBySlug('huetor-vega')).toBeNull();
    expect(await createMembershipStore(client, TABLE).listForUser(ANA.authUserId)).toEqual([]);
  });

  it('refuses bad data before it touches the table', async () => {
    // A colour that is not a colour, and a code that is not an INE code. Both are
    // typed by hand on a command line, which is why they are checked at all.
    await expect(
      onboardMunicipality(client, TABLE, { ...HUETOR, primaryColor: 'azul' }, ANA, CATEGORIES),
    ).rejects.toThrow();
    await expect(
      onboardMunicipality(client, TABLE, { ...HUETOR, ineCode: '18' }, ANA, CATEGORIES),
    ).rejects.toThrow();

    // An administrator with no account is a membership pointing at nobody: an
    // invitation that can never be accepted.
    await expect(
      onboardMunicipality(client, TABLE, HUETOR, { ...ANA, authUserId: '' }, CATEGORIES),
    ).rejects.toThrow(/account/);

    expect(await createPublicStore(client, TABLE).getMunicipalityBySlug('huetor-vega')).toBeNull();
  });
});

/**
 * The gap between the two tools that set a town hall up.
 *
 * `onboardMunicipality` makes a municipality and its first person together.
 * `migrate-seed` makes municipalities and no people at all — which is how La
 * Zubia ended up in the table with twenty-two events and nobody able to open
 * the panel for it.
 */
describe.skipIf(local === null)('adding an administrator to a town that exists', () => {
  let client: StoreClient;

  beforeEach(async () => {
    client = createStoreClient({
      region: 'eu-central-1',
      endpoint: local?.endpoint ?? '',
      credentials: LOCAL_CREDENTIALS,
    });

    await dropTable(client, TABLE);
    await createTable(client, TABLE);
    await seed(client, TABLE);
  });

  afterAll(async () => {
    await dropTable(client, TABLE);
  });

  it('lets the named person administer a seeded municipality', async () => {
    await addAdministrator(client, TABLE, ZUBIA, ANA);

    const memberships = createMembershipStore(client, TABLE);
    const mine = await memberships.listForUser(ANA.authUserId);

    expect(mine).toHaveLength(1);
    expect(mine[0]?.role).toBe('municipal_admin');
    expect(mine[0]?.municipalityId).toBe(ZUBIA);

    // Same proof as the founder's: she can do the job without anybody granting
    // her anything afterwards.
    const staff = await memberships.listForMunicipality(actorFrom(mine[0]!));

    expect(staff.map((one) => one.email)).toContain(ANA.email);
  });

  it('refuses a municipality that is not there', async () => {
    await expect(addAdministrator(client, TABLE, 'mun-inventado', ANA)).rejects.toThrow(
      NoSuchMunicipality,
    );
  });

  it('refuses to quietly promote somebody who already has access', async () => {
    await addAdministrator(client, TABLE, ZUBIA, ANA);

    await expect(addAdministrator(client, TABLE, ZUBIA, ANA)).rejects.toThrow(AlreadyAMember);
  });

  it('writes nothing on a dry run', async () => {
    await addAdministrator(client, TABLE, ZUBIA, ANA, { dryRun: true });

    const memberships = createMembershipStore(client, TABLE);

    expect(await memberships.listForUser(ANA.authUserId)).toHaveLength(0);
  });
});

// At the end of the file rather than inside a block: the container is shared by
// every describe here, and whichever one stopped it would break the next.
afterAll(async () => {
  await local?.stop();
});
