'use client';

import {
  byStartDate,
  formatWhen,
  formatLongDate,
  formatTime,
  isActivityAwaitingReview,
  isAwaitingReview,
  type Activity,
  type Event,
} from '@agora/core';
import Link from 'next/link';
import { useState } from 'react';

import { Button, Card, Empty, Field, PageHeader, TextArea } from '../../../components/ui';
import { usePanel } from '../../../lib/panel-store';

/**
 * Review queue for events submitted by the town's associations.
 *
 * This screen is the product's main commercial argument: the calendar stays
 * full because brotherhoods, clubs and parent associations fill it, and the
 * town hall only says yes or no.
 */
export default function ReviewPage() {
  const {
    activities,
    approveActivity,
    approveEvent,
    events,
    loading,
    municipality,
    organizations,
    rejectActivity,
    rejectEvent,
    role,
  } = usePanel();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  if (loading || !municipality) {
    return <p className="text-sm text-neutral-500">Cargando…</p>;
  }

  // Reachable by typing the address, since a static site has no server to stop
  // anybody. The API refuses it too, which is where it matters.
  if (role === 'org_editor') {
    return (
      <>
        <PageHeader title="Revisión" />
        <Empty>La bandeja de revisión es del ayuntamiento.</Empty>
      </>
    );
  }

  const context = { now: new Date(), timeZone: municipality.timeZone, locale: 'es' as const };
  const pending = events.filter(isAwaitingReview).sort(byStartDate);
  const trusted = organizations.filter((organization) => organization.isTrusted);

  /**
   * Lines of a programme waiting on a decision: new ones, and edits to published
   * ones.
   *
   * Their event comes with them, because "Taller de queso curado" on its own is
   * not something anybody can approve — the question is whether it belongs in
   * that feria. Events still waiting themselves are left out: approving the
   * feria publishes its programme with it, so listing both would ask the same
   * question twice.
   */
  const pendingActivities = activities
    .filter(isActivityAwaitingReview)
    .map((activity) => ({ activity, event: events.find((entry) => entry.id === activity.eventId) }))
    .filter(
      (entry): entry is { activity: Activity; event: Event } =>
        entry.event !== undefined && !isAwaitingReview(entry.event),
    )
    .sort(
      (left, right) => left.activity.startAt.getTime() - right.activity.startAt.getTime(),
    );

  return (
    <>
      <PageHeader
        title="Revisión"
        description="Eventos que las asociaciones han enviado y esperan tu aprobación."
      />

      {pending.length === 0 && pendingActivities.length === 0 ? (
        <Empty>No hay nada pendiente. Las asociaciones no tienen eventos en cola.</Empty>
      ) : pending.length === 0 ? null : (
        <div className="grid gap-3">
          {pending.map((event) => {
            const organization = organizations.find((entry) => entry.id === event.organizationId);

            return (
              <Card key={event.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {formatWhen(event, context)} · {event.location.name}
                    </p>
                    <p className="mt-1 text-sm">
                      Enviado por{' '}
                      <span className="font-medium">{organization?.name ?? 'una asociación'}</span>
                    </p>
                    {event.description ? (
                      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                        {event.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      brand={municipality.branding.primaryColor}
                      onClick={() => void approveEvent(event.id)}
                    >
                      Aprobar y publicar
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setRejecting(rejecting === event.id ? null : event.id);
                        setReason('');
                      }}
                    >
                      Rechazar
                    </Button>
                  </div>
                </div>

                {rejecting === event.id ? (
                  <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/10">
                    <Field
                      label="Motivo del rechazo"
                      hint="Se lo enviamos a la asociación por email para que pueda corregirlo."
                    >
                      <TextArea
                        value={reason}
                        onChange={(changeEvent) => setReason(changeEvent.target.value)}
                        rows={2}
                        placeholder="Falta el permiso de ocupación de la vía pública."
                      />
                    </Field>
                    <div className="mt-3">
                      <Button
                        variant="danger"
                        disabled={reason.trim() === ''}
                        onClick={() => {
                          void rejectEvent(event.id, reason.trim());
                          setRejecting(null);
                        }}
                      >
                        Rechazar evento
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {pendingActivities.length === 0 ? null : (
        <section className="mt-8">
          <h2 className="mb-1 text-lg font-semibold">Actividades dentro de un evento</h2>
          <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
            Líneas del programa de un evento ya publicado. Hasta que las apruebes, los vecinos ven
            el programa como estaba.
          </p>

          <div className="grid gap-3">
            {pendingActivities.map(({ activity, event }) => {
              const organization = organizations.find(
                (entry) => entry.id === event.organizationId,
              );
              const key = `activity-${activity.id}`;

              return (
                <Card key={activity.id}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium">{activity.title}</p>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {formatLongDate(activity.startAt, context)} ·{' '}
                        {formatTime(activity.startAt, context)}
                      </p>
                      <p className="mt-1 text-sm">
                        Dentro de{' '}
                        <Link
                          href={`/eventos/editar?id=${event.id}`}
                          className="font-medium underline"
                        >
                          {event.title}
                        </Link>
                        {organization ? `, de ${organization.name}` : ''}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {activity.pendingPatch === null
                          ? 'Actividad nueva, todavía no publicada.'
                          : 'Cambio sobre una actividad que los vecinos ya ven.'}
                      </p>
                      {activity.description ? (
                        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                          {activity.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        brand={municipality.branding.primaryColor}
                        onClick={() => void approveActivity(event.id, activity.id)}
                      >
                        {activity.pendingPatch === null ? 'Aprobar y publicar' : 'Aprobar el cambio'}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setRejecting(rejecting === key ? null : key);
                          setReason('');
                        }}
                      >
                        Rechazar
                      </Button>
                    </div>
                  </div>

                  {rejecting === key ? (
                    <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/10">
                      <Field
                        label="Motivo del rechazo"
                        hint="Se lo enviamos a la asociación por email para que pueda corregirlo."
                      >
                        <TextArea
                          value={reason}
                          onChange={(changeEvent) => setReason(changeEvent.target.value)}
                          rows={2}
                          placeholder="Esa hora se solapa con la procesión."
                        />
                      </Field>
                      <div className="mt-3">
                        <Button
                          variant="danger"
                          disabled={reason.trim() === ''}
                          onClick={() => {
                            void rejectActivity(event.id, activity.id, reason.trim());
                            setRejecting(null);
                          }}
                        >
                          Rechazar actividad
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Asociaciones de confianza</h2>
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
          Sus eventos se publican sin pasar por esta bandeja. Es la forma de que la cola no crezca.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {organizations.map((organization) => (
            <Card key={organization.id}>
              <p className="font-medium">{organization.name}</p>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {organization.isTrusted ? 'Publica sin revisión' : 'Sus eventos pasan por revisión'}
                {organization.status === 'invited' ? ' · Invitación pendiente' : ''}
              </p>
            </Card>
          ))}
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          {trusted.length} de {organizations.length} asociaciones publican sin revisión.
        </p>
      </section>
    </>
  );
}
