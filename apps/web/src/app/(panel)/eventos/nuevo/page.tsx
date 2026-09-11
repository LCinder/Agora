'use client';

import { EventForm } from '../../../../components/event-form';
import { PageHeader } from '../../../../components/ui';

export default function NewEventPage() {
  return (
    <>
      <PageHeader
        title="Nuevo evento"
        description="Título, fecha y lugar bastan. Todo lo demás es opcional."
      />
      <EventForm />
    </>
  );
}
