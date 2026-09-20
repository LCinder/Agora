'use client';

import { byStartDate, formatWhen, minutesSince, type Event } from '@agora/core';
import type { LiveSession } from '@agora/data';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, Card, Empty, Field, PageHeader, Select } from '../../../components/ui';
import { usePanel } from '../../../lib/panel-store';

/**
 * Live tracking, from the town hall's side.
 *
 * Three hours before the procession sets off, somebody in the town hall has to
 * arm this and read a code out to whoever is carrying the phone. So the screen is
 * a list of what can be tracked, one button to arm it, the code in type big enough
 * to read across a room, and start, pause and end.
 *
 * The code is single use and dictated out loud, which is why its alphabet has no
 * O, 0, I or 1 (D-043). There is no QR yet because the app has no scanner: the
 * volunteer types it, and adding a picture of a code nobody can scan would only
 * look like a feature.
 */
const STATUS_LABELS: Record<LiveSession['status'], string> = {
  scheduled: 'Preparado, sin empezar',
  active: 'Emitiendo',
  paused: 'En pausa',
  ended: 'Terminado',
};

/** What can plausibly be followed live: something that has not finished yet. */
function trackable(events: Event[]): Event[] {
  const yesterday = Date.now() - 24 * 60 * 60 * 1000;

  return events
    .filter((event) => event.status === 'published' && event.startAt.getTime() > yesterday)
    .sort(byStartDate);
}

export default function LivePage() {
  const { events, getLive, loading, municipality, role, runLive, scheduleLive } = usePanel();

  const [sessions, setSessions] = useState<Record<string, LiveSession | null>>({});
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const candidates = useMemo(() => trackable(events), [events]);
  const armed = useMemo(
    () => candidates.filter((event) => event.liveTrackingEnabled),
    [candidates],
  );

  // A string of ids rather than the array itself: the array is rebuilt on every
  // render, and an effect that depends on it would ask the API on every render.
  const armedIds = armed.map((event) => event.id).join(',');

  const load = useCallback(async () => {
    const ids = armedIds === '' ? [] : armedIds.split(',');
    const found = await Promise.all(ids.map(async (id) => [id, await getLive(id)] as const));

    setSessions(Object.fromEntries(found));
  }, [armedIds, getLive]);

  useEffect(() => {
    // The API is an external system as far as React is concerned: the state
    // update happens after the await, in a callback, not in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (loading || !municipality) {
    return <p className="text-sm text-neutral-500">Cargando…</p>;
  }

  if (role === 'org_editor') {
    return (
      <>
        <PageHeader title="Directos" />
        <Empty>
          Los directos los prepara el ayuntamiento. Si tu hermandad quiere que se siga la procesión,
          pídeselo y te darán el código para el móvil que la lleve.
        </Empty>
      </>
    );
  }

  const context = { now: new Date(), timeZone: municipality.timeZone, locale: 'es' as const };

  async function run(eventId: string, action: 'schedule' | 'start' | 'pause' | 'end') {
    setBusy(eventId);
    setError(null);

    try {
      const session =
        action === 'schedule' ? await scheduleLive(eventId) : await runLive(eventId, action);

      setSessions((current) => ({ ...current, [eventId]: session }));
      if (action === 'schedule') setSelected('');
    } catch {
      setError('No hemos podido cambiar el directo. Inténtalo de nuevo.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Directos"
        description="Para procesiones, cabalgatas, romerías y carreras. Prepara el directo y dale el código a quien lleve el móvil."
      />

      <Card className="mb-6">
        <h2 className="text-lg font-semibold">Preparar un directo</h2>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            if (selected !== '') void run(selected, 'schedule');
          }}
        >
          <Field label="Evento">
            <Select value={selected} onChange={(changed) => setSelected(changed.target.value)}>
              <option value="">Elige un evento</option>
              {candidates.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title} · {formatWhen(event, context)}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-end">
            <Button
              type="submit"
              disabled={selected === ''}
              brand={municipality.branding.primaryColor}
            >
              Preparar y generar código
            </Button>
          </div>
        </form>

        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          Prepararlo otra vez genera un código nuevo y anula el anterior.
        </p>

        {error !== null ? (
          <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </Card>

      {armed.length === 0 ? (
        <Empty>No hay ningún directo preparado. Elige un evento aquí arriba.</Empty>
      ) : (
        <div className="grid gap-3">
          {armed.map((event) => {
            const session = sessions[event.id] ?? null;
            const working = busy === event.id;

            return (
              <Card key={event.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {formatWhen(event, context)} · {event.location.name}
                    </p>
                    <p className="mt-1 text-sm">
                      {session === null ? 'Sin sesión' : STATUS_LABELS[session.status]}
                      {session?.lastPositionAt == null
                        ? ''
                        : ` · última posición hace ${minutesSince(session.lastPositionAt, new Date())} min`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {session?.status === 'active' ? (
                      <Button
                        variant="secondary"
                        disabled={working}
                        onClick={() => void run(event.id, 'pause')}
                      >
                        Pausar
                      </Button>
                    ) : session !== null && session.status !== 'ended' ? (
                      <Button
                        disabled={working}
                        brand={municipality.branding.primaryColor}
                        onClick={() => void run(event.id, 'start')}
                      >
                        {session.status === 'paused' ? 'Seguir emitiendo' : 'Empezar'}
                      </Button>
                    ) : null}

                    {session !== null && session.status !== 'ended' ? (
                      <Button
                        variant="danger"
                        disabled={working}
                        onClick={() => void run(event.id, 'end')}
                      >
                        Terminar
                      </Button>
                    ) : null}
                  </div>
                </div>

                {session?.volunteerCode == null ? null : (
                  <div className="mt-4 rounded-lg border border-black/10 p-4 dark:border-white/10">
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      Código para el voluntario. Se usa una sola vez: si se queda sin batería,
                      prepara el directo otra vez y dale el nuevo.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-4">
                      <p className="font-mono text-3xl font-bold tracking-[0.3em]">
                        {session.volunteerCode}
                      </p>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          void navigator.clipboard
                            ?.writeText(session.volunteerCode ?? '')
                            .then(() => setCopied(event.id))
                            .catch(() => undefined);
                        }}
                      >
                        {copied === event.id ? 'Copiado' : 'Copiar'}
                      </Button>
                    </div>
                    <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                      En la app: Ajustes → Modo voluntario.
                    </p>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
