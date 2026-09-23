'use client';

import { formatWhen, groupEvents, isAwaitingReview, residentVisibleEvents } from '@agora/core';
import Link from 'next/link';

import { Card, Empty, PageHeader, StatTile, StatusBadge } from '../../components/ui';
import { DEMO_ACTIVE_DEVICES } from '../../lib/demo';
import { usePanel } from '../../lib/panel-store';

/**
 * Panel home.
 *
 * Two questions, answered above the fold: is anything waiting for me, and is
 * this working. Everything else is one click away.
 */
export default function PanelHome() {
  const { activities, events, loading, municipality, organizationId, role, stats } = usePanel();

  if (loading || !municipality) {
    return <p className="text-sm text-neutral-500">Cargando…</p>;
  }

  const municipal = role === 'municipal_editor' || role === 'municipal_admin';
  const context = { now: new Date(), timeZone: municipality.timeZone, locale: 'es' as const };

  // An association's home is about its own events; the town hall's is about the
  // whole calendar and what is waiting for them.
  const ours = municipal
    ? events
    : events.filter((event) => event.organizationId === organizationId);

  const pending = ours.filter(isAwaitingReview);
  const published = residentVisibleEvents(municipal ? events : ours);
  // With the programmes, so "Hoy y este finde" counts a feria that is running
  // rather than one that started on Tuesday and has no end date typed in.
  const groups = groupEvents(published, {
    now: context.now,
    timeZone: context.timeZone,
    activities,
  });

  const totalInterest =
    stats?.interests.total ?? published.reduce((sum, event) => sum + event.interestCount, 0);

  return (
    <>
      <PageHeader
        title={municipality.name}
        description="Resumen de la agenda del municipio."
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Eventos publicados" value={published.length} />
        <StatTile
          label="Hoy y este finde"
          value={groups.today.length + groups.thisWeekend.length}
        />
        <StatTile
          label={municipal ? 'Pendientes de revisión' : 'Esperando aprobación'}
          value={pending.length}
          hint={municipal ? 'De asociaciones' : 'Del ayuntamiento'}
        />
        {municipal ? (
          <StatTile
            label="Dispositivos activos"
            value={(stats?.devices.following ?? DEMO_ACTIVE_DEVICES).toLocaleString('es-ES')}
            hint="Vecinos con la app, sin registrarse"
          />
        ) : (
          <StatTile label="Mis eventos" value={ours.length} />
        )}
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">
          {municipal ? 'Pendiente de revisión' : 'Esperando aprobación del ayuntamiento'}
        </h2>
        {pending.length === 0 ? (
          <Empty>
            {municipal
              ? 'No hay eventos de asociaciones esperando aprobación.'
              : 'No tienes nada esperando aprobación.'}
          </Empty>
        ) : (
          <div className="grid gap-3">
            {pending.map((event) => (
              <Card key={event.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {formatWhen(event, context)} · {event.location.name}
                    </p>
                  </div>
                  {municipal ? (
                    <Link href="/revision" className="text-sm font-semibold underline">
                      Revisar
                    </Link>
                  ) : (
                    <StatusBadge status={event.status} />
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {municipal ? 'Próximos eventos' : 'Mis próximos eventos'}
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {totalInterest.toLocaleString('es-ES')} marcas de «Me interesa» en total
          </p>
        </div>

        {groups.today.length + groups.thisWeekend.length + groups.upcoming.length === 0 ? (
          <Empty>Todavía no hay nada programado.</Empty>
        ) : (
          <div className="grid gap-3">
            {[...groups.today, ...groups.thisWeekend, ...groups.upcoming]
              .slice(0, 6)
              .map((event) => (
                <Card key={event.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{event.title}</p>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {formatWhen(event, context)} · {event.location.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={event.status} />
                      <Link
                        href={`/eventos/editar?id=${event.id}`}
                        className="text-sm font-semibold underline"
                      >
                        Editar
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
          </div>
        )}
      </section>
    </>
  );
}
