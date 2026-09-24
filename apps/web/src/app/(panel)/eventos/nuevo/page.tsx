'use client';

import { EventForm } from '../../../../components/event-form';
import { Card, PageHeader } from '../../../../components/ui';

export default function NewEventPage() {
  return (
    <>
      <PageHeader
        title="Nuevo evento"
        description="Título, fecha y lugar bastan. Todo lo demás es opcional."
      />
      <EventForm />

      {/* The programme comes after the event exists, and saying so here is what
          stops somebody hunting for it on this page. An activity belongs to an
          event, so there is nothing to attach one to until this is saved. */}
      <Card className="mt-6">
        <h2 className="font-display text-base font-semibold">
          ¿Es una feria o una semana cultural?
        </h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Guarda primero el evento. Al abrirlo para editarlo podrás añadirle las actividades que
          tiene dentro, cada una con su hora, y los vecinos podrán pulsar «Asistiré» en la que vayan
          a ir.
        </p>
      </Card>
    </>
  );
}
