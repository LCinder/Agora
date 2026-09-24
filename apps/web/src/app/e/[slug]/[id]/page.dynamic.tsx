import { formatLongDate, formatTime, isVisibleToResidents } from '@agora/core';
import { createSeedDataSource } from '@agora/data';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/**
 * Public page of an event.
 *
 * This is where a WhatsApp link lands for someone who does not have the app,
 * and it is the product's growth loop: the town hall publishes once, a
 * neighbour shares it, and whoever opens it is one tap from installing. That
 * makes the Open Graph tags below part of the product rather than polish —
 * the preview card is what people actually see in the chat.
 */

// Seed events are anchored to the current day, so this page is rendered per
// request rather than baked at build time. That is also why the file is named
// `.dynamic.tsx`: the static export of the panel leaves it out, and in phase 2
// this page is the `event-page` Lambda behind CloudFront. See D-031.
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string; id: string }>;
}

async function loadEvent(slug: string, id: string) {
  const source = createSeedDataSource();
  const municipality = await source.getMunicipalityBySlug(slug);
  if (!municipality) return null;

  const event = await source.getEvent(municipality.id, id);
  if (!event || !isVisibleToResidents(event)) return null;

  const organizations = await source.listOrganizations(municipality.id);
  const organization = organizations.find((entry) => entry.id === event.organizationId) ?? null;

  return { municipality, event, organization };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, id } = await params;
  const loaded = await loadEvent(slug, id);

  if (!loaded) return { title: 'Evento no encontrado' };

  const context = {
    now: new Date(),
    timeZone: loaded.municipality.timeZone,
    locale: 'es' as const,
  };
  const description = `${formatLongDate(loaded.event.startAt, context)} · ${loaded.event.location.name}`;

  return {
    title: `${loaded.event.title} · ${loaded.municipality.name}`,
    description,
    openGraph: {
      title: loaded.event.title,
      description,
      type: 'website',
      locale: 'es_ES',
    },
  };
}

export default async function PublicEventPage({ params }: PageProps) {
  const { slug, id } = await params;
  const loaded = await loadEvent(slug, id);

  if (!loaded) notFound();

  const { municipality, event, organization } = loaded;
  const context = { now: new Date(), timeZone: municipality.timeZone, locale: 'es' as const };
  const brand = municipality.branding.primaryColor;

  const mapUrl =
    event.location.latitude !== null && event.location.longitude !== null
      ? `https://www.openstreetmap.org/?mlat=${event.location.latitude}&mlon=${event.location.longitude}#map=17/${event.location.latitude}/${event.location.longitude}`
      : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="inline-block size-6 rounded"
          style={{ backgroundColor: brand }}
        />
        <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
          {municipality.name}
        </p>
      </div>

      {event.status === 'cancelled' ? (
        <p className="mt-6 rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-900">
          Este evento se ha cancelado.
        </p>
      ) : null}

      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{event.title}</h1>

      <dl className="mt-6 grid gap-3 text-base">
        <div>
          <dt className="text-sm text-neutral-500">Cuándo</dt>
          <dd>
            {formatLongDate(event.startAt, context)}
            {event.allDay ? null : (
              <>
                {' · '}
                {formatTime(event.startAt, context)}
                {event.endAt ? ` – ${formatTime(event.endAt, context)}` : ''}
              </>
            )}
          </dd>
        </div>

        <div>
          <dt className="text-sm text-neutral-500">Dónde</dt>
          <dd>
            {mapUrl ? (
              <a href={mapUrl} className="underline" rel="noreferrer noopener" target="_blank">
                {event.location.name}
              </a>
            ) : (
              event.location.name
            )}
          </dd>
        </div>

        <div>
          <dt className="text-sm text-neutral-500">Organiza</dt>
          <dd>{organization ? organization.name : `Ayuntamiento de ${municipality.name}`}</dd>
        </div>

        <div>
          <dt className="text-sm text-neutral-500">Precio</dt>
          <dd>{event.isFree ? 'Entrada gratuita' : (event.priceInfo ?? 'Consultar')}</dd>
        </div>
      </dl>

      {event.description ? (
        <p className="mt-6 text-base leading-relaxed">{event.description}</p>
      ) : null}

      <div className="mt-10 rounded-xl p-5 text-white" style={{ backgroundColor: brand }}>
        <p className="text-lg font-semibold">Toda la agenda de {municipality.name} en el móvil</p>
        <p className="mt-1 text-sm opacity-90">
          Di «Asistiré» y te recordamos lo que vayas a ir a ver, y te avisamos si cambia de hora o se
          cancela.
        </p>
        <p className="mt-4 text-sm font-semibold underline">Descargar la app</p>
      </div>

      <p className="mt-8 text-xs text-neutral-500">Versión de demostración con datos de ejemplo.</p>
    </main>
  );
}
