import { type StoreClient, createPublicStore, createStoreClient } from '@agora/store';
import {
  EVENTS,
  LOCAL_CREDENTIALS,
  type LocalDynamo,
  ZUBIA,
  createTable,
  dropTable,
  seed,
  startDynamoLocal,
} from '@agora/store/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { escapeHtml } from '../lib/event-page-html';
import type { ApiEvent } from '../lib/http';
import { parsePath, route } from './event-page';

/**
 * The page a shared link lands on.
 *
 * Most of what matters here is not visible on the page: the Open Graph tags, the
 * status code for something that is not published, and the fact that a title with
 * a quotation mark in it does not break the document.
 */
const local: LocalDynamo | null = await startDynamoLocal();
const TABLE = `agora-event-page-${process.pid}`;
const SITE = 'https://d111111abcdef8.cloudfront.net';

const request = (path: string): ApiEvent =>
  ({ rawPath: path, requestContext: { http: { method: 'GET' } } }) as unknown as ApiEvent;

const statusOf = (result: Awaited<ReturnType<typeof route>>) =>
  (result as { statusCode: number }).statusCode;

const htmlOf = (result: Awaited<ReturnType<typeof route>>) => (result as { body: string }).body;

describe('the path', () => {
  it('takes /e/<slug>/<id>, with or without a trailing slash', () => {
    expect(parsePath('/e/la-zubia/evt-1')).toEqual({ slug: 'la-zubia', eventId: 'evt-1' });
    expect(parsePath('e/la-zubia/evt-1/')).toEqual({ slug: 'la-zubia', eventId: 'evt-1' });
  });

  it('refuses anything else', () => {
    for (const path of ['/', '/e', '/e/la-zubia', '/e/la-zubia/evt-1/extra', '/x/a/b']) {
      expect(parsePath(path)).toBeNull();
    }
  });
});

describe('escaping', () => {
  it('leaves nothing that could close a tag or an attribute', () => {
    expect(escapeHtml(`<script>"'&`)).toBe('&lt;script&gt;&quot;&#39;&amp;');
  });
});

describe.skipIf(local === null)('the public event page', () => {
  let client: StoreClient;

  beforeAll(async () => {
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
    await local?.stop();
  });

  const serve = (path: string) => route(request(path), createPublicStore(client, TABLE), SITE);

  it('renders the event with the card a chat app reads', async () => {
    const result = await serve(`/e/la-zubia/${EVENTS.zubiaPublished}`);
    const html = htmlOf(result);

    expect(statusOf(result)).toBe(200);
    expect(html).toContain('<meta property="og:title" content="Cabalgata"');
    expect(html).toContain('<meta property="og:locale" content="es_ES"');
    expect(html).toContain(
      `<meta property="og:url" content="${SITE}/e/la-zubia/${EVENTS.zubiaPublished}"`,
    );
    expect(html).toContain('og:description');
    expect(html).toContain('<html lang="es">');
  });

  it('says what a resident needs to know without opening anything else', async () => {
    const html = htmlOf(await serve(`/e/la-zubia/${EVENTS.zubiaPublished}`));

    expect(html).toContain('La Zubia');
    expect(html).toContain('Plaza');
    expect(html).toContain('Cuándo');
    expect(html).toContain('Entrada gratuita');
    expect(html).toContain('Ayuntamiento de La Zubia');
  });

  it('offers to open the app with the brand scheme', async () => {
    const html = htmlOf(await serve(`/e/la-zubia/${EVENTS.zubiaPublished}`));

    expect(html).toContain('hoyq://event/');
  });

  /**
   * The programme on the page somebody opens from a WhatsApp group.
   *
   * It is also the reason the page is worth having for a feria at all: the card
   * says "13 actividades", and what is behind the link is the poster, readable
   * in the street on a phone with no app installed.
   */
  it('prints the programme of an event that has one', async () => {
    const { createStaffStore } = await import('@agora/store');
    const staff = createStaffStore(client, TABLE, {
      authUserId: 'auth-editor',
      municipalityId: ZUBIA,
      role: 'municipal_editor',
      organizationId: null,
    });

    await staff.createActivity(EVENTS.zubiaPublished, {
      id: 'act-page-falcons',
      title: 'Show de aves rapaces',
      startAt: new Date('2027-03-01T17:00:00.000Z'),
      endAt: new Date('2027-03-01T18:00:00.000Z'),
    });
    await staff.createActivity(EVENTS.zubiaPublished, {
      id: 'act-page-rained',
      title: 'Justa medieval',
      startAt: new Date('2027-03-01T19:00:00.000Z'),
      location: { name: 'Explanada del pabellón', latitude: null, longitude: null },
    });
    await staff.cancelActivity(EVENTS.zubiaPublished, 'act-page-rained');

    const html = htmlOf(await serve(`/e/la-zubia/${EVENTS.zubiaPublished}`));

    expect(html).toContain('Programa');
    expect(html).toContain('Show de aves rapaces');
    // Printed where it happens, because that one is not where the event is.
    expect(html).toContain('Explanada del pabellón');
    // A cancelled line stays on the programme and says so: the person opening
    // this link on the Saturday morning is exactly who needs to read it.
    expect(html).toContain('Justa medieval');
    expect(html).toContain('Cancelada');
    // And the card a chat app reads says how big the thing is, which is what
    // makes somebody open the link.
    expect(html).toContain('2 actividades');

    await staff.deleteActivity(EVENTS.zubiaPublished, 'act-page-falcons');
    await staff.deleteActivity(EVENTS.zubiaPublished, 'act-page-rained');
  });

  it('leaves the programme out of an event that has none', async () => {
    const html = htmlOf(await serve(`/e/la-zubia/${EVENTS.zubiaPublished}`));

    expect(html).not.toContain('<h2>Programa</h2>');
  });

  it('says a cancelled event is cancelled rather than hiding it', async () => {
    const result = await serve(`/e/la-zubia/${EVENTS.zubiaCancelled}`);

    expect(statusOf(result)).toBe(200);
    expect(htmlOf(result)).toContain('Este evento se ha cancelado.');
  });

  it('answers a draft exactly as it answers a link that never existed', async () => {
    const draft = await serve(`/e/la-zubia/${EVENTS.zubiaDraft}`);
    const nonsense = await serve('/e/la-zubia/evt-nope');
    const town = await serve('/e/no-existe/evt-nope');

    expect(statusOf(draft)).toBe(404);
    expect(htmlOf(draft)).toBe(htmlOf(nonsense));
    expect(statusOf(town)).toBe(404);
    expect(htmlOf(draft)).toContain('noindex');
  });

  it('is cached, because one shared link is read by a whole group at once', async () => {
    const result = await serve(`/e/la-zubia/${EVENTS.zubiaPublished}`);
    const headers = (result as { headers: Record<string, string> }).headers;

    expect(headers['cache-control']).toContain('max-age=60');
    expect(headers['content-type']).toContain('text/html');
  });

  it('does not let a title break the document', async () => {
    const staff = createPublicStore(client, TABLE);

    // Written straight to the table, because the point is the renderer and not
    // who is allowed to type it.
    const { createStaffStore } = await import('@agora/store');
    const store = createStaffStore(client, TABLE, {
      authUserId: 'auth-editor',
      municipalityId: ZUBIA,
      role: 'municipal_editor',
      organizationId: null,
    });

    await store.createEvent({
      id: 'evt-quotes',
      title: 'Teatro: "El alcalde" & cía <en la plaza>',
      categoryId: 'cat-fiestas',
      startAt: new Date('2027-07-01T20:00:00.000Z'),
      location: { name: 'Plaza', latitude: null, longitude: null },
      status: 'published',
    });

    expect(await staff.getVisibleEvent(ZUBIA, 'evt-quotes')).not.toBeNull();

    const html = htmlOf(await serve('/e/la-zubia/evt-quotes'));

    expect(html).toContain('&quot;El alcalde&quot; &amp; cía &lt;en la plaza&gt;');
    expect(html).not.toContain('<en la plaza>');
  });
});
