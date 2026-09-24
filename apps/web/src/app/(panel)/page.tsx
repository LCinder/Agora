'use client';

import { ListChecks, Pencil, Plus } from 'lucide-react';
import { formatWhen, groupEvents, isAwaitingReview, residentVisibleEvents } from '@agora/core';

import { Figure, Rule } from '../../components/report';
import { ButtonLink, Card, Empty, IconLink, PageHeader, StatusBadge } from '../../components/ui';
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
          <ButtonLink href="/eventos/nuevo" icon={Plus} brand={municipality.branding.primaryColor}>
            Nuevo evento
          </ButtonLink>
        }
      />

      {/* Cifras, no tarjetas: aqui no se actua sobre ninguna. Lo que si se
          toca — lo que espera revision, lo que viene — esta debajo y si lleva
          su borde. Ver design.md. */}
      {/* En dos columnas los dos primeros abren fila, asi que los dos pierden
          la regla de arriba; `Figure` solo se la quita al primero, que es lo
          correcto en la columna unica de Datos. */}
      <dl className="grid gap-x-10 sm:grid-cols-2 sm:[&>*:nth-child(2)]:border-t-0">
        <Figure label="Eventos publicados" value={String(published.length)} />
        <Figure
          label="Hoy y este finde"
          value={String(groups.today.length + groups.thisWeekend.length)}
        />
        <Figure
          label={municipal ? 'Pendientes de revisión' : 'Esperando aprobación'}
          hint={municipal ? 'De asociaciones' : 'Del ayuntamiento'}
          value={String(pending.length)}
        />
        {municipal ? (
          <Figure
            label="Dispositivos activos"
            hint="Vecinos con la app, sin registrarse"
            value={(stats?.devices.following ?? DEMO_ACTIVE_DEVICES).toLocaleString('es-ES')}
          />
        ) : (
          <Figure label="Mis eventos" value={String(ours.length)} />
        )}
      </dl>

      <section className="mt-10">
        <Rule className="mb-5" />
        <h2 className="font-display mb-3 text-lg font-semibold">
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
                    <IconLink icon={ListChecks} label="Revisar este evento" href="/revision" />
                  ) : (
                    <StatusBadge status={event.status} />
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <Rule className="mb-5" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">
            {municipal ? 'Próximos eventos' : 'Mis próximos eventos'}
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {totalInterest.toLocaleString('es-ES')} asistencias previstas en total
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
                      <IconLink
                        icon={Pencil}
                        label="Editar este evento"
                        href={`/eventos/editar?id=${event.id}`}
                      />
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
