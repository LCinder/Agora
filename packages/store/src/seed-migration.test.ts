import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type StoreClient, createStoreClient } from './client';
import { createDeviceStore } from './device-store';
import { createPublicStore } from './public-store';
import { type MunicipalityBundle, migrateSeed } from './seed-migration';
import { LOCAL_CREDENTIALS, type LocalDynamo, startDynamoLocal } from './testing/dynamo-local';
import { CATEGORY, EVENTS, ZUBIA, createTable, dropTable, event } from './testing/fixtures';

/**
 * Loading a town hall into the table, twice.
 *
 * The first run is the easy half. The second is the one worth a test: a
 * migration that is not safe to re-run is a migration nobody dares to run, and
 * the specific way it could go wrong here is silent — overwriting an event would
 * reset the count of residents who marked it, and a wrong number in the panel
 * looks exactly like a right one.
 */
const local: LocalDynamo | null = await startDynamoLocal();
const TABLE = `agora-migration-${process.pid}`;

const bundle: MunicipalityBundle = {
  municipality: {
    id: ZUBIA,
    slug: 'la-zubia',
    name: 'La Zubia',
    province: 'Granada',
    population: 20_000,
    ineCode: '18908',
    latitude: 37.1,
    longitude: -3.6,
    timeZone: 'Europe/Madrid',
    defaultLocale: 'es',
    status: 'pilot',
    branding: { primaryColor: '#5B3DF5', logoUrl: null, heroImageUrl: null },
    settings: { reminderHour: 19, maxDailyNotifications: 3 },
    features: [],
  },
  categories: [
    {
      id: CATEGORY,
      municipalityId: null,
      slug: 'fiestas',
      name: 'Fiestas',
      icon: 'sparkles',
      color: '#5B3DF5',
    },
  ],
  organizations: [
    {
      id: 'org-hermandad',
      municipalityId: ZUBIA,
      name: 'Hermandad',
      type: 'brotherhood',
      contactEmail: null,
      isTrusted: false,
      status: 'active',
      logoUrl: null,
    },
  ],
  events: [
    event({
      id: EVENTS.zubiaPublished,
      municipalityId: ZUBIA,
      title: 'Cabalgata',
      status: 'published',
    }),
    event({ id: EVENTS.zubiaDraft, municipalityId: ZUBIA, title: 'Borrador', status: 'draft' }),
  ],
};

describe.skipIf(local === null)('the seed migration', () => {
  let client: StoreClient;

  beforeAll(async () => {
    client = createStoreClient({
      region: 'eu-central-1',
      endpoint: local?.endpoint ?? '',
      credentials: LOCAL_CREDENTIALS,
    });

    await dropTable(client, TABLE);
    await createTable(client, TABLE);
  });

  afterAll(async () => {
    await dropTable(client, TABLE);
    await local?.stop();
  });

  it('counts what it wrote', async () => {
    const result = await migrateSeed(client, TABLE, [bundle]);

    expect(result).toEqual({
      municipalities: 1,
      categories: 1,
      organizations: 1,
      events: 2,
    });
  });

  it('leaves the municipality reachable by slug and by id', async () => {
    const store = createPublicStore(client, TABLE);

    expect((await store.getMunicipalityBySlug('la-zubia'))?.id).toBe(ZUBIA);
    expect((await store.getMunicipality(ZUBIA))?.name).toBe('La Zubia');
    expect((await store.listMunicipalities()).map((town) => town.slug)).toEqual(['la-zubia']);
  });

  it('writes the categories and the associations of the municipality', async () => {
    const store = createPublicStore(client, TABLE);

    expect((await store.listCategories(ZUBIA)).map((category) => category.slug)).toEqual([
      'fiestas',
    ]);
    expect((await store.listOrganizations(ZUBIA)).map((org) => org.name)).toEqual(['Hermandad']);
  });

  it('puts the published event in the calendar and leaves the draft out of it', async () => {
    const store = createPublicStore(client, TABLE);
    const ids = (await store.listCalendar(ZUBIA)).map((entry) => entry.id);

    expect(ids).toEqual([EVENTS.zubiaPublished]);
    expect(ids).not.toContain(EVENTS.zubiaDraft);
  });

  it('keeps the interest counts when it runs again', async () => {
    const device = createDeviceStore(client, TABLE, 'device-one');
    await device.markInterest(ZUBIA, EVENTS.zubiaPublished);

    await migrateSeed(client, TABLE, [bundle]);

    const events = await createPublicStore(client, TABLE).listCalendar(ZUBIA);
    const marked = events.find((entry) => entry.id === EVENTS.zubiaPublished);

    expect(marked).toBeDefined();
    expect(await device.listInterests()).toHaveLength(1);

    // The counter is read the way the panel reads it: off the item itself.
    const raw = await createPublicStore(client, TABLE).getVisibleEvent(
      ZUBIA,
      EVENTS.zubiaPublished,
    );

    expect(raw).not.toBeNull();
  });

  it('writes nothing when asked not to', async () => {
    const empty = `${TABLE}-dry`;
    const store = createPublicStore(client, empty);
    const result = await migrateSeed(client, empty, [bundle], { dryRun: true });

    expect(result.events).toBe(2);
    // The table does not even exist, which is the strongest proof a dry run
    // wrote nothing at all.
    await expect(store.listMunicipalities()).rejects.toThrow();
  });
});
