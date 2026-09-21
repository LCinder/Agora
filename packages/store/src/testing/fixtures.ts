import type { Event, EventStatus, Municipality, Organization } from '@agora/core';
import { CreateTableCommand, DeleteTableCommand } from '@aws-sdk/client-dynamodb';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

import type { StoreClient } from '../client';
import {
  categoryItem,
  municipalityItem,
  municipalityPointerItem,
  organizationItem,
  toEventItem,
} from '../items';
import { createTableInput } from '../table-definition';

/**
 * The town of the isolation tests, and the town next door.
 *
 * Same shape as the fixtures of `infra/db/tests.sql`, so the two suites can be
 * read side by side: two municipalities, two associations that must not see each
 * other, a trusted one, a town hall draft, and two devices with marks.
 */
export const ZUBIA = 'mun-zubia';
export const OTURA = 'mun-otura';

export const HERMANDAD = 'org-hermandad';
export const PENA = 'org-pena';
export const CORAL = 'org-coral-trusted';

export const DEVICE_ONE = 'device-one';
export const DEVICE_TWO = 'device-two';

export const CATEGORY = 'cat-fiestas';

function municipality(id: string, slug: string, name: string): Municipality {
  return {
    id,
    slug,
    name,
    province: 'Granada',
    population: 20_000,
    ineCode: id === ZUBIA ? '18908' : '18150',
    latitude: 37.1,
    longitude: -3.6,
    timeZone: 'Europe/Madrid',
    defaultLocale: 'es',
    status: 'pilot',
    branding: { primaryColor: '#5B3DF5', logoUrl: null, heroImageUrl: null },
    settings: { reminderHour: 19, maxDailyNotifications: 3 },
    features: [],
  };
}

function organization(
  id: string,
  municipalityId: string,
  name: string,
  isTrusted: boolean,
): Organization {
  return {
    id,
    municipalityId,
    name,
    type: 'brotherhood',
    contactEmail: null,
    isTrusted,
    status: 'active',
    logoUrl: null,
  };
}

export function event(input: {
  id: string;
  municipalityId: string;
  organizationId?: string | null;
  title: string;
  status: EventStatus;
  startAt?: Date;
}): Event {
  const now = new Date('2027-01-01T10:00:00.000Z');

  return {
    id: input.id,
    municipalityId: input.municipalityId,
    organizationId: input.organizationId ?? null,
    title: input.title,
    description: '',
    categoryId: CATEGORY,
    startAt: input.startAt ?? new Date('2027-03-01T19:00:00.000Z'),
    endAt: null,
    allDay: false,
    location: { name: 'Plaza', latitude: null, longitude: null },
    imageUrl: null,
    priceInfo: null,
    isFree: true,
    audienceTags: [],
    interestCount: 0,
    viewCount: 0,
    status: input.status,
    rejectionReason: input.status === 'rejected' ? 'Sin motivo' : null,
    isFeatured: false,
    liveTrackingEnabled: false,
    createdAt: now,
    updatedAt: now,
    publishedAt: input.status === 'published' ? now : null,
  };
}

/** Ids of the fixture events, so the tests can say what they mean. */
export const EVENTS = {
  zubiaPublished: 'evt-zubia-published',
  zubiaDraft: 'evt-zubia-draft',
  hermandadPending: 'evt-hermandad-pending',
  penaPending: 'evt-pena-pending',
  zubiaCancelled: 'evt-zubia-cancelled',
  oturaPublished: 'evt-otura-published',
  oturaDraft: 'evt-otura-draft',
} as const;

export async function createTable(client: StoreClient, tableName: string): Promise<void> {
  await client.send(new CreateTableCommand(createTableInput(tableName)));
}

export async function dropTable(client: StoreClient, tableName: string): Promise<void> {
  await client.send(new DeleteTableCommand({ TableName: tableName })).catch(() => undefined);
}

export async function seed(client: StoreClient, tableName: string): Promise<void> {
  const put = async (item: Record<string, unknown>) => {
    await client.send(new PutCommand({ TableName: tableName, Item: item }));
  };

  for (const town of [
    municipality(ZUBIA, 'la-zubia', 'La Zubia'),
    municipality(OTURA, 'otura', 'Otura'),
  ]) {
    await put(municipalityItem(town));
    await put(municipalityPointerItem(town));
    await put(
      categoryItem(town.id, {
        id: CATEGORY,
        municipalityId: null,
        slug: 'fiestas',
        name: 'Fiestas',
        icon: 'sparkles',
        color: '#5B3DF5',
      }),
    );
  }

  await put(organizationItem(ZUBIA, organization(HERMANDAD, ZUBIA, 'Hermandad', false)));
  await put(organizationItem(ZUBIA, organization(PENA, ZUBIA, 'Peña', false)));
  await put(organizationItem(ZUBIA, organization(CORAL, ZUBIA, 'Coral', true)));

  const fixtures: Event[] = [
    event({
      id: EVENTS.zubiaPublished,
      municipalityId: ZUBIA,
      title: 'Cabalgata',
      status: 'published',
    }),
    event({ id: EVENTS.zubiaDraft, municipalityId: ZUBIA, title: 'Borrador', status: 'draft' }),
    event({
      id: EVENTS.hermandadPending,
      municipalityId: ZUBIA,
      organizationId: HERMANDAD,
      title: 'Vía crucis',
      status: 'pending_review',
    }),
    event({
      id: EVENTS.penaPending,
      municipalityId: ZUBIA,
      organizationId: PENA,
      title: 'Concurso de tortillas',
      status: 'pending_review',
    }),
    event({
      id: EVENTS.zubiaCancelled,
      municipalityId: ZUBIA,
      title: 'Verbena suspendida',
      status: 'cancelled',
    }),
    event({
      id: EVENTS.oturaPublished,
      municipalityId: OTURA,
      title: 'Coral',
      status: 'published',
    }),
    event({
      id: EVENTS.oturaDraft,
      municipalityId: OTURA,
      title: 'Borrador de Otura',
      status: 'draft',
    }),
  ];

  for (const fixture of fixtures) {
    await put(toEventItem(fixture));
  }
}
