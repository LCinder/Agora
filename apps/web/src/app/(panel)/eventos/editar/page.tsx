'use client';

import { publicEventPath } from '@agora/core';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { EventForm } from '../../../../components/event-form';
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
import { demoInterestCount } from '../../../../lib/demo';

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
  const { addNotice, cancelEvent, events, loading, municipality, notices, refreshNotices } =
    usePanel();

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
          event.status === 'cancelled' ? undefined : (
            <Button variant="danger" onClick={() => cancelEvent(event.id)}>
              Cancelar evento
            </Button>
          )
        }
      />

      <EventForm event={event} />

      <section className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <NoticeComposer
          interested={demoInterestCount(event.id, event.isFeatured)}
          onSend={(type, message) => void addNotice({ eventId: event.id, type, message })}
        />

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
 * the "Me interesa" feature in a sales meeting.
 */
function NoticeComposer({
  interested,
  onSend,
}: {
  interested: number;
  onSend: (type: EventNotice['type'], message: string) => void;
}) {
  const { municipality } = usePanel();
  const [type, setType] = useState<EventNotice['type']>('time_change');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  return (
    <Card>
      <h2 className="text-lg font-semibold">Enviar un aviso</h2>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        Llega solo a los {interested} vecinos que marcaron «Me interesa» en este evento.
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

        <p className="text-xs text-neutral-500">
          En la demo el envío es simulado: no se manda ninguna notificación real.
        </p>
      </div>
    </Card>
  );
}
