import { residentVisibleEvents } from '@agora/core';
import { describe, expect, it } from 'vitest';

import { createSeedDataSource } from './seed-data-source';

// Thursday 10 September 2026, 12:00 in Madrid. Pinned so the relative seed
// dates resolve to the same instants on every run.
const NOW = new Date('2026-09-10T10:00:00Z');

function source() {
  return createSeedDataSource({ now: () => NOW });
}

describe('municipalities', () => {
  it('loads every seeded municipality, sorted by name', async () => {
    const municipalities = await source().listMunicipalities();

    expect(municipalities.map((m) => m.slug)).toEqual(['cajar', 'la-zubia', 'ogijares', 'otura']);
  });

  it('loads La Zubia with its verified register data', async () => {
    const municipality = await source().getMunicipalityBySlug('la-zubia');

    expect(municipality).not.toBeNull();
    expect(municipality?.ineCode).toBe('18193');
    expect(municipality?.population).toBe(20389);
    expect(municipality?.timeZone).toBe('Europe/Madrid');
  });

  it('returns null for a municipality that is not on the platform', async () => {
    expect(await source().getMunicipalityBySlug('sevilla')).toBeNull();
  });
});

describe('categories', () => {
  it('gives a municipality the shared categories plus its own', async () => {
    const categories = await source().listCategories('la-zubia');
    const slugs = categories.map((category) => category.slug);

    expect(slugs).toContain('cultura');
    expect(slugs).toContain('semana-santa');
  });

  it('never leaks the categories another municipality defined', async () => {
    const categories = await source().listCategories('otura');
    const slugs = categories.map((category) => category.slug);

    expect(slugs).toContain('cultura');
    expect(slugs).not.toContain('semana-santa');
  });
});

describe('events', () => {
  it('anchors relative events to the day the app is opened', async () => {
    const event = await source().getEvent('la-zubia', 'lz-cine-fresca');

    // Seeded as "today at 22:00"; Madrid is two hours ahead of UTC in September.
    expect(event?.startAt.toISOString()).toBe('2026-09-10T20:00:00.000Z');
    expect(event?.endAt?.toISOString()).toBe('2026-09-10T21:45:00.000Z');
  });

  it('rolls an event that runs past midnight into the next day', async () => {
    const event = await source().getEvent('la-zubia', 'lz-noche-flamenca');

    expect(event).not.toBeNull();
    expect(event!.endAt!.getTime()).toBeGreaterThan(event!.startAt.getTime());
  });

  it('leaves fixed festivity dates alone', async () => {
    const event = await source().getEvent('la-zubia', 'lz-cabalgata');

    expect(event?.startAt.toISOString()).toBe('2027-01-05T17:00:00.000Z');
    expect(event?.liveTrackingEnabled).toBe(true);
  });

  it('stamps every event with the municipality it came from', async () => {
    const events = await source().listEvents('la-zubia');

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.municipalityId === 'la-zubia')).toBe(true);
  });

  it('returns events of other municipalities only through their own id', async () => {
    const otura = await source().listEvents('otura');

    expect(otura.map((event) => event.id)).toEqual(['ot-concierto', 'ot-senderismo']);
  });

  it('serves the panel every status but hides the pending ones from residents', async () => {
    const all = await source().listEvents('la-zubia');
    const visible = residentVisibleEvents(all);

    expect(all.map((event) => event.id)).toContain('lz-mercadillo-solidario');
    expect(visible.map((event) => event.id)).not.toContain('lz-mercadillo-solidario');
  });

  it('keeps cancelled events visible so nobody turns up to nothing', async () => {
    const visible = residentVisibleEvents(await source().listEvents('la-zubia'));

    expect(visible.map((event) => event.id)).toContain('lz-yoga-parque');
  });

  it('returns null for an event id that does not exist', async () => {
    expect(await source().getEvent('la-zubia', 'nope')).toBeNull();
  });

  it('rejects a request for an unknown municipality instead of answering empty', async () => {
    await expect(source().listEvents('sevilla')).rejects.toThrow('Unknown municipality');
  });
});

describe('organizations and route', () => {
  it('loads the associations of the municipality', async () => {
    const organizations = await source().listOrganizations('la-zubia');

    expect(organizations.map((organization) => organization.id)).toContain('hermandad-san-juan');
    expect(organizations.find((o) => o.id === 'hermandad-san-juan')?.isTrusted).toBe(true);
  });

  it('loads the planned route for the simulated live tracking', async () => {
    const route = await source().getPlannedRoute('la-zubia');

    expect(route?.type).toBe('LineString');
    expect(route?.coordinates.length).toBeGreaterThan(20);
  });

  it('returns no route for a municipality that has none', async () => {
    expect(await source().getPlannedRoute('cajar')).toBeNull();
  });
});
