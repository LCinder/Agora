'use client';

import { parseLocalDateTime, toLocalParts, type Event } from '@agora/core';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { usePanel, type NewEvent } from '../lib/panel-store';
import { PosterPanel } from './poster-panel';
import { Button, Card, Checkbox, Field, Input, Select, TextArea } from './ui';

/**
 * Create and edit an event.
 *
 * Only three fields are required — title, start date and time, and place —
 * because the acceptance criterion for this screen is that a municipal
 * officer can publish an event in under a minute. Everything else is optional
 * and can be filled in later.
 */
export function EventForm({ event }: { event?: Event }) {
  const {
    categories,
    createEvent,
    municipality,
    organizationId: ownOrganizationId,
    organizations,
    role,
    updateEvent,
  } = usePanel();
  const router = useRouter();
  const timeZone = municipality?.timeZone ?? 'Europe/Madrid';

  // What the button can honestly promise. An association that the town hall has
  // not marked as trusted cannot publish, whatever it asks the API for, so saying
  // "Publicar evento" to them would be a lie the next screen would correct.
  const mine = organizations.find((organization) => organization.id === ownOrganizationId);
  const publishesDirectly = role !== 'org_editor' || mine?.isTrusted === true;

  const start = event ? toLocalParts(event.startAt, timeZone) : null;
  const end = event?.endAt ? toLocalParts(event.endAt, timeZone) : null;

  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [categoryId, setCategoryId] = useState(event?.categoryId ?? '');
  const [date, setDate] = useState(start?.date ?? '');
  const [startTime, setStartTime] = useState(start?.timeOfDay ?? '');
  const [endTime, setEndTime] = useState(end?.timeOfDay ?? '');
  const [locationName, setLocationName] = useState(event?.location.name ?? '');
  const [isFree, setIsFree] = useState(event?.isFree ?? true);
  const [priceInfo, setPriceInfo] = useState(event?.priceInfo ?? '');
  // Carried, not edited. What is on the cover is chosen from one list in
  // Eventos, where the question "which one is it" can only have one answer;
  // a checkbox here would let two events each believe they are the cover.
  const isFeatured = event?.isFeatured ?? false;
  const [organizationId, setOrganizationId] = useState(event?.organizationId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState<'new' | 'edit' | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);

  function buildDraft(): NewEvent | null {
    if (!title.trim() || !date || !startTime || !locationName.trim()) {
      setError('Faltan el título, la fecha, la hora de inicio o el lugar.');
      return null;
    }

    const startAt = parseLocalDateTime(date, startTime, timeZone);
    let endAt = endTime ? parseLocalDateTime(date, endTime, timeZone) : null;

    // An event running from 22:00 to 00:30 finishes the next day.
    if (endAt && endAt.getTime() < startAt.getTime()) {
      endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
    }

    return {
      title: title.trim(),
      description: description.trim(),
      categoryId: categoryId || (categories[0]?.id ?? 'cultura'),
      startAt,
      endAt,
      locationName: locationName.trim(),
      latitude: event?.location.latitude ?? municipality?.latitude ?? null,
      longitude: event?.location.longitude ?? municipality?.longitude ?? null,
      isFree,
      priceInfo: isFree ? null : priceInfo.trim() || null,
      isFeatured,
      organizationId: organizationId || null,
    };
  }

  async function submit() {
    const draft = buildDraft();
    if (!draft) return;

    // The list is only left once the write has landed: with a real backend behind
    // this, navigating first would show the previous calendar for a second and
    // hide any refusal the API sent back.
    if (event) {
      const result = await updateEvent(event.id, draft);

      // An untrusted association editing something already published does not
      // change what the neighbours see: the change waits for the town hall, and
      // saying so here is what stops them editing it again tomorrow.
      if (result === 'queued') {
        setQueued('edit');

        return;
      }
    } else if ((await createEvent(draft)) === 'queued') {
      setQueued('new');

      return;
    }

    router.push('/eventos');
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card>
        <form
          className="grid gap-4"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            void submit();
          }}
        >
          <Field label="Título" required>
            <Input
              ref={titleRef}
              value={title}
              onChange={(changeEvent) => setTitle(changeEvent.target.value)}
              placeholder="Concierto de la Banda Municipal"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Fecha" required>
              <Input
                type="date"
                value={date}
                onChange={(changeEvent) => setDate(changeEvent.target.value)}
              />
            </Field>
            <Field label="Hora de inicio" required>
              <Input
                type="time"
                value={startTime}
                onChange={(changeEvent) => setStartTime(changeEvent.target.value)}
              />
            </Field>
            <Field label="Hora de fin">
              <Input
                type="time"
                value={endTime}
                onChange={(changeEvent) => setEndTime(changeEvent.target.value)}
              />
            </Field>
          </div>

          <Field label="Lugar" required>
            <Input
              value={locationName}
              onChange={(changeEvent) => setLocationName(changeEvent.target.value)}
              placeholder="Plaza del Ayuntamiento"
            />
          </Field>

          <Field label="Categoría">
            <Select
              value={categoryId}
              onChange={(changeEvent) => setCategoryId(changeEvent.target.value)}
            >
              <option value="">Sin categoría</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          {/* An association's events are its own, and the API writes them that way
              whatever this form sends, so there is nothing here to choose. */}
          <Field label="Organiza" hidden={role === 'org_editor'}>
            <Select
              value={organizationId}
              onChange={(changeEvent) => setOrganizationId(changeEvent.target.value)}
            >
              <option value="">El Ayuntamiento</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Descripción">
            <TextArea
              value={description}
              onChange={(changeEvent) => setDescription(changeEvent.target.value)}
              placeholder="Lo que el vecino necesita saber para venir."
            />
          </Field>

          <div className="flex flex-wrap items-center gap-4">
            <Checkbox label="Entrada gratuita" checked={isFree} onChange={setIsFree} />
          </div>

          {isFree ? null : (
            <Field label="Precio">
              <Input
                value={priceInfo}
                onChange={(changeEvent) => setPriceInfo(changeEvent.target.value)}
                placeholder="5 € en taquilla"
              />
            </Field>
          )}

          {error ? (
            <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
              {error}
            </p>
          ) : null}

          {queued !== null ? (
            <p role="status" className="text-sm font-medium">
              {queued === 'edit'
                ? 'Guardado y enviado al ayuntamiento. Hasta que lo aprueben, los vecinos siguen viendo la versión anterior.'
                : 'Enviado al ayuntamiento. Aparecerá en la agenda cuando lo aprueben.'}{' '}
              <button
                type="button"
                onClick={() => router.push('/eventos')}
                className="underline underline-offset-2"
              >
                Volver a mis eventos
              </button>
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" brand={municipality?.branding.primaryColor}>
              {event
                ? 'Guardar cambios'
                : publishesDirectly
                  ? 'Publicar evento'
                  : 'Enviar al ayuntamiento'}
            </Button>
            <Button variant="secondary" onClick={() => router.push('/eventos')}>
              Cancelar
            </Button>
          </div>
        </form>
      </Card>

      <PosterPanel
        subject={{ title, date, startTime, locationName }}
        onRead={(reading) => {
          if (reading.title) setTitle(reading.title);
          if (reading.description) setDescription(reading.description);
          if (reading.startDate) setDate(reading.startDate);
          if (reading.startTime) setStartTime(reading.startTime);
          if (reading.endTime) setEndTime(reading.endTime);
          if (reading.locationName) setLocationName(reading.locationName);
          if (reading.priceInfo) setPriceInfo(reading.priceInfo);
          setIsFree(reading.isFree);
          titleRef.current?.focus();
        }}
      />
    </div>
  );
}
