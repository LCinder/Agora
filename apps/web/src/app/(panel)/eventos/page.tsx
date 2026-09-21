'use client';

import { byStartDate, formatWhen, type Event, type EventStatus } from '@agora/core';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import {
  Button,
  Card,
  Empty,
  Field,
  PageHeader,
  Select,
  StatusBadge,
} from '../../../components/ui';
import { usePanel } from '../../../lib/panel-store';

const STATUS_OPTIONS: { value: EventStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'published', label: 'Publicados' },
  { value: 'pending_review', label: 'Pendientes de revisión' },
  { value: 'cancelled', label: 'Cancelados' },
  { value: 'rejected', label: 'Rechazados' },
];

export default function EventsPage() {
  const { categories, events, loading, municipality, organizationId, organizations, role } =
    usePanel();
  const [status, setStatus] = useState<EventStatus | 'all'>('all');
  const [categoryId, setCategoryId] = useState('all');

  const ownOnly = role === 'org_editor';

  const filtered = useMemo(() => {
    return (
      events
        // An association's panel is its own events, as the product document puts
        // it (9.6). The API already keeps the rest of the town's drafts away from
        // them; this is so the list is theirs and not a mixed one.
        .filter((event) => !ownOnly || event.organizationId === organizationId)
        .filter((event) => status === 'all' || event.status === status)
        .filter((event) => categoryId === 'all' || event.categoryId === categoryId)
        .sort(byStartDate)
    );
  }, [categoryId, events, organizationId, ownOnly, status]);

  if (loading || !municipality) {
    return <p className="text-sm text-neutral-500">Cargando…</p>;
  }

  const context = { now: new Date(), timeZone: municipality.timeZone, locale: 'es' as const };

  return (
    <>
      <PageHeader
        title={ownOnly ? 'Mis eventos' : 'Eventos'}
        description={
          ownOnly
            ? 'Los eventos de tu asociación, con el estado en el que está cada uno.'
            : 'Todo lo que hay en la agenda, en cualquier estado.'
        }
        action={
          <Link
            href="/eventos/nuevo"
            className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-white"
            style={{ backgroundColor: municipality.branding.primaryColor }}
          >
            Nuevo evento
          </Link>
        }
      />

      {ownOnly ? null : <FeaturedPicker />}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        <Select
          aria-label="Filtrar por estado"
          value={status}
          onChange={(event) => setStatus(event.target.value as EventStatus | 'all')}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Filtrar por categoría"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="all">Todas las categorías</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Empty>No hay eventos con estos filtros.</Empty>
      ) : (
        <div className="grid gap-3">
          {filtered.map((event) => {
            const organization = organizations.find((entry) => entry.id === event.organizationId);

            return (
              <Card key={event.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {formatWhen(event, context)} · {event.location.name}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {organization ? organization.name : 'Ayuntamiento'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {event.isFeatured ? (
                      <span className="rounded bg-neutral-900 px-2 py-0.5 text-xs font-semibold text-white">
                        En portada
                      </span>
                    ) : null}
                    <StatusBadge status={event.status} />
                    <Link
                      href={`/eventos/editar?id=${event.id}`}
                      className="text-sm font-semibold underline"
                    >
                      Editar
                    </Link>
                    <DeleteEvent event={event} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

/**
 * Which event is on the cover of the app, of which there is one.
 *
 * It lives here and not in the event form because it is a decision about the
 * calendar rather than about an event: a checkbox on a form answers "is this
 * one featured", and the question the town hall actually has is "what is on the
 * cover this week". One list, one answer, and choosing a new one takes the last
 * one off — the store enforces that too, so a second browser tab cannot end up
 * with two.
 *
 * Only published events are offered. The cover of the app is not a place to put
 * a draft, and a cancelled event there would be the worst thing the calendar
 * could lead with.
 */
function FeaturedPicker() {
  const { events, municipality, updateEvent } = usePanel();
  const [working, setWorking] = useState(false);

  const candidates = useMemo(
    () => events.filter((event) => event.status === 'published').sort(byStartDate),
    [events],
  );

  const featured = events.find((event) => event.isFeatured && event.status === 'published');

  async function choose(nextId: string) {
    if (working) return;

    setWorking(true);

    try {
      // The old one is cleared explicitly rather than left to the server. The
      // API does enforce it, but the demo build has no server at all, and a
      // panel that behaves differently in a meeting is not the panel.
      if (featured && featured.id !== nextId) {
        await updateEvent(featured.id, { isFeatured: false });
      }

      if (nextId !== '') await updateEvent(nextId, { isFeatured: true });
    } finally {
      setWorking(false);
    }
  }

  return (
    <Card className="mb-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field
          label="Destacado en la portada"
          hint="Sale grande al abrir la aplicación. Solo puede haber uno: al elegir otro, el anterior deja de estarlo."
        >
          <Select
            value={featured?.id ?? ''}
            disabled={working}
            onChange={(change) => void choose(change.target.value)}
          >
            <option value="">Ninguno</option>
            {candidates.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </Select>
        </Field>

        {featured ? (
          <p className="text-sm text-neutral-600">
            Ahora mismo:{' '}
            <Link href={`/eventos/editar?id=${featured.id}`} className="font-semibold underline">
              {featured.title}
            </Link>
          </p>
        ) : (
          <p className="text-sm text-neutral-600">
            Sin destacado. La portada abre con lo que hay hoy
            {municipality ? ` en ${municipality.name}` : ''}.
          </p>
        )}
      </div>
    </Card>
  );
}

/**
 * Deleting an event, which is not the same as cancelling it.
 *
 * Two clicks and no dialog: a `confirm()` is a browser modal that behaves
 * differently on every machine this gets demonstrated on, and the second click
 * says what it does rather than asking a yes/no question about something that
 * has scrolled out of view.
 *
 * A published event says "cancel it instead" first, because that is almost
 * always the right answer: the neighbours who marked it have to be told, and an
 * event that simply disappears from the calendar reads as a bug in the app.
 */
function DeleteEvent({ event }: { event: Event }) {
  const { deleteEvent, role } = usePanel();
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const visible = event.status !== 'published' || role !== 'org_editor';

  if (!visible) return null;

  if (!asking) {
    return (
      <span className="inline-flex items-center gap-2">
        {failed === null ? null : <span className="text-xs text-red-700">{failed}</span>}
        <button
          type="button"
          onClick={() => {
            setFailed(null);
            setAsking(true);
          }}
          className="text-sm font-semibold text-red-700 underline"
        >
          Borrar
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {event.status === 'published' || event.status === 'cancelled' ? (
        <span className="text-xs text-neutral-600">
          Los vecinos ya lo han visto. Se borra sin avisarles.
        </span>
      ) : null}
      <Button
        variant="danger"
        onClick={() => {
          setFailed(null);
          void deleteEvent(event.id).catch((error: unknown) => {
            setAsking(false);
            setFailed(error instanceof Error ? error.message : 'No se ha podido borrar.');
          });
        }}
      >
        Borrar para siempre
      </Button>
      <Button variant="secondary" onClick={() => setAsking(false)}>
        Mejor no
      </Button>
    </span>
  );
}
