'use client';

import { publicEventPath } from '@agora/core';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { EventForm } from '../../../../components/event-form';
import { ProgrammeEditor } from '../../../../components/programme-editor';
import {
  Button,
  Card,
  Empty,
  Field,
  PageHeader,
  Select,
  TextArea,
} from '../../../../components/ui';
import { usePanel, type EventNotice } from '../../../../lib/panel-store';
import { useRouter } from 'next/navigation';

const NOTICE_TYPES: { value: EventNotice['type']; label: string }[] = [
  { value: 'time_change', label: 'Cambio de hora' },
  { value: 'location_change', label: 'Cambio de lugar' },
  { value: 'cancelled', label: 'Cancelación' },
  { value: 'notice', label: 'Aviso' },
];

/**
 * Edit an event.
 *
 * The id arrives as `?id=`, not as a path segment. A static export can only
 * produce the pages it can enumerate at build time, and the events of a
 * municipality are not knowable then — the panel invents them in the browser
 * (D-013). A query string costs nothing to serve and works for an event created
 * a minute ago. See D-031.
 *
 * `useSearchParams` needs a Suspense boundary to be prerendered, hence the
 * split between this component and the view below.
 */
export default function EditEventPage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Cargando…</p>}>
      <EditEventView />
    </Suspense>
  );
}

function EditEventView() {
  const id = useSearchParams().get('id') ?? '';
  const router = useRouter();
  const {
    addNotice,
    cancelEvent,
    deleteEvent,
    events,
    featureEvent,
    loading,
    municipality,
    notices,
    refreshNotices,
    role,
    stats,
  } = usePanel();

  // Cancelling an event and sending a notice are the town hall's (7.3): a message
  // to every neighbour who marked something cannot be taken back.
  const municipal = role === 'municipal_editor' || role === 'municipal_admin';

  // With a real backend the notices live under the event, so they are asked for
  // when one is opened. A no-op in the demo, which holds them all in the browser.
  useEffect(() => {
    if (id !== '') void refreshNotices(id);
  }, [id, refreshNotices]);

  const event = events.find((entry) => entry.id === id);

  if (loading || !municipality) {
    return <p className="text-sm text-neutral-500">Cargando…</p>;
  }

  if (!event) {
    return (
      <>
        <PageHeader title="Evento no encontrado" />
        <Empty>
          Este evento ya no existe.{' '}
          <Link href="/eventos" className="underline">
            Volver a la lista
          </Link>
        </Empty>
      </>
    );
  }

  const eventNotices = notices.filter((notice) => notice.eventId === event.id);

  return (
    <>
      <PageHeader
        title={event.title}
        description={`Página pública: ${publicEventPath(municipality.slug, event.id)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {event.status === 'cancelled' ? null : (
              <Button variant="danger" onClick={() => cancelEvent(event.id)}>
                Cancelar evento
              </Button>
            )}
            <DeleteEvent
              cancellable={event.status === 'published'}
              onDelete={async () => {
                await deleteEvent(event.id);
                router.replace('/eventos');
              }}
            />
          </div>
        }
      />

      <EventForm event={event} />

      {/* Under the event's own fields, because that is the order the work
          happens in: a technician types the feria, saves it, and then works
          down the poster adding what is inside it. */}
      <ProgrammeEditor event={event} />

      <section className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        {municipal ? (
          <div className="grid gap-6">
            <NoticeComposer
              interested={event.interestCount}
              onSend={(type, message) => void addNotice({ eventId: event.id, type, message })}
            />
            <FeaturedComposer
              following={stats?.devices.following ?? null}
              published={event.status === 'published'}
              onSend={(message) => void featureEvent(event.id, message)}
            />
          </div>
        ) : (
          <Card className="h-fit">
            <h2 className="text-lg font-semibold">Avisos</h2>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Los avisos a los vecinos los envía el ayuntamiento. Si cambia la hora o el lugar,
              edítalo aquí y ellos lo avisarán.
            </p>
          </Card>
        )}

        <Card className="h-fit">
          <h2 className="text-lg font-semibold">Avisos enviados</h2>
          {eventNotices.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Todavía no se ha enviado ninguno.
            </p>
          ) : (
            <ul className="mt-3 grid gap-3">
              {eventNotices.map((notice) => (
                <li key={notice.id} className="text-sm">
                  <p className="font-medium">
                    {NOTICE_TYPES.find((entry) => entry.value === notice.type)?.label}
                  </p>
                  <p className="text-neutral-600 dark:text-neutral-400">{notice.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}

/**
 * Composer for an event notice.
 *
 * The count matters more than it looks: it is the first time a municipal
 * officer sees that an event has an audience, and it is the whole argument for
 * the "Asistiré" feature in a sales meeting.
 */
/**
 * The one thing in this panel that reaches somebody who never asked for anything.
 *
 * Which is why it is a separate card from the notice composer instead of a fifth
 * notice type, why it asks twice, and why it says the number out loud: a notice
 * goes to the people who marked the event, and this goes to the town. The
 * difference is the whole reason the product can promise that notifications are
 * worth reading.
 *
 * Only for a published event. A draft has no public page for the notification to
 * open, and a cancelled one would be the worst message this system could send.
 */
function FeaturedComposer({
  following,
  published,
  onSend,
}: {
  /** Phones following the municipality, or null when the panel has no figure. */
  following: number | null;
  published: boolean;
  onSend: (message: string) => void;
}) {
  const { municipality } = usePanel();
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState(false);

  if (!published) {
    return (
      <Card className="h-fit">
        <h2 className="text-lg font-semibold">Destacar en todo el municipio</h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Solo se puede destacar un evento publicado. Publícalo arriba y vuelve aquí.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">Destacar en todo el municipio</h2>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        {following === null
          ? 'Llega a todos los vecinos con la aplicación, no solo a quien ha dicho que asistirá.'
          : `Llega a los ${following} vecinos con la aplicación, no solo a quien ha dicho que asistirá.`}{' '}
        Úsalo poco: un aviso que llega a todo el mundo lo silencia todo el mundo.
      </p>

      <div className="mt-4 grid gap-4">
        <Field label="Mensaje">
          <TextArea
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              setConfirming(false);
            }}
            placeholder="Mañana empieza la feria. Programa completo en la aplicación."
            rows={3}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          {confirming ? (
            <>
              <Button
                variant="danger"
                onClick={() => {
                  onSend(message.trim());
                  setMessage('');
                  setConfirming(false);
                  setSent(true);
                }}
              >
                Sí, enviar a todo el municipio
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Mejor no
              </Button>
            </>
          ) : (
            <Button
              brand={municipality?.branding.primaryColor}
              disabled={message.trim() === ''}
              onClick={() => setConfirming(true)}
            >
              Destacar
            </Button>
          )}
          {sent && !confirming ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Enviado. Sale en menos de un minuto.
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function NoticeComposer({
  interested,
  onSend,
}: {
  interested: number;
  onSend: (type: EventNotice['type'], message: string) => void;
}) {
  const { demo, municipality } = usePanel();
  const [type, setType] = useState<EventNotice['type']>('time_change');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  return (
    <Card>
      <h2 className="text-lg font-semibold">Enviar un aviso</h2>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        Llega solo a los {interested} vecinos que han dicho que asistirán a este evento, o a alguna
        de sus actividades.
      </p>

      <div className="mt-4 grid gap-4">
        <Field label="Tipo de aviso">
          <Select
            value={type}
            onChange={(event) => setType(event.target.value as EventNotice['type'])}
          >
            {NOTICE_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Mensaje">
          <TextArea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="La procesión sale a las 20:30 en lugar de a las 20:00."
            rows={3}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            brand={municipality?.branding.primaryColor}
            disabled={message.trim() === ''}
            onClick={() => {
              onSend(type, message.trim());
              setMessage('');
              setSent(true);
            }}
          >
            Enviar aviso
          </Button>
          {sent ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Enviado a {interested} vecinos.
            </p>
          ) : null}
        </div>

        {/* Only in the demo. Against the real backend this notice reaches the
            outbox and the job delivers it within the minute, and telling a
            municipal technician that their cancellation was pretend is worse
            than saying nothing. */}
        {demo ? (
          <p className="text-xs text-neutral-500">
            En la demo el envío es simulado: no se manda ninguna notificación real.
          </p>
        ) : (
          <p className="text-xs text-neutral-500">
            Sale en menos de un minuto, solo a quien ha dicho que asistirá a este evento.
          </p>
        )}
      </div>
    </Card>
  );
}

/**
 * Deleting the event this page is about.
 *
 * Next to "Cancelar evento" and deliberately quieter than it: cancelling is the
 * answer almost every time, because the neighbours who marked it get told, and
 * this one leaves nothing at all. Two clicks, and the second says what it does.
 */
function DeleteEvent({
  cancellable,
  onDelete,
}: {
  /** Published, so cancelling is the thing they probably meant. */
  cancellable: boolean;
  onDelete: () => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  if (!asking) {
    return (
      <span className="inline-flex items-center gap-2">
        {failed === null ? null : <span className="text-xs text-red-700">{failed}</span>}
        <Button variant="secondary" onClick={() => setAsking(true)}>
          Borrar
        </Button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-xs text-neutral-600">
        {cancellable
          ? 'Se borra sin avisar a quien lo marcó. Para eso, cancélalo.'
          : 'No se puede deshacer.'}
      </span>
      <Button
        variant="danger"
        onClick={() => {
          setFailed(null);
          void onDelete().catch((error: unknown) => {
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
