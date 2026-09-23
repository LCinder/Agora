'use client';

import {
  activitiesOf,
  activityDefaults,
  activityHasOwnLocation,
  activityPrice,
  formatLongDate,
  formatTime,
  groupActivitiesByDay,
  isActivityAwaitingReview,
  parseLocalDateTime,
  reportableCount,
  toLocalParts,
  type Activity,
  type Event,
} from '@agora/core';
import type { NewActivityInput } from '@agora/data';
import { useState } from 'react';

import { usePanel } from '../lib/panel-store';
import { Button, Card, Checkbox, Field, Input, Select, StatusBadge, TextArea } from './ui';

/**
 * The programme of an event: adding lines to it, and editing them.
 *
 * A town hall types a feria in one sitting, off a poster or a Word document, so
 * the form that adds a line stays open and clears itself after each save.
 * Anything that made them press "Añadir actividad" again between the falconry
 * show and the cheese workshop would be a form nobody finishes.
 *
 * Only the title and the time are required, for the same reason only three
 * fields are required on an event: the rest is inherited from the event, which
 * is what almost every line of a real programme does anyway.
 */
export function ProgrammeEditor({ event }: { event: Event }) {
  const { activities, categories, createActivity, municipality, role } = usePanel();

  const timeZone = municipality?.timeZone ?? 'Europe/Madrid';
  const context = { now: new Date(), timeZone, locale: 'es' as const };
  const lines = activitiesOf(activities, event.id);
  const days = groupActivitiesByDay(lines, timeZone);

  // What the button can honestly promise, the same rule the event form uses:
  // an association without trust does not change a published programme.
  const queued = role === 'org_editor' && event.status === 'published';

  return (
    <Card className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Programa</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {lines.length === 0
            ? 'Para una feria, una semana cultural o una romería: las actividades que hay dentro.'
            : `${lines.length} actividades. Los vecinos pueden marcar «Me interesa» en cada una.`}
        </p>
      </div>

      {days.length === 0 ? null : (
        <div className="mt-5 grid gap-6">
          {days.map((day) => (
            <section key={day.date.toISOString()}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {formatLongDate(day.date, context)}
              </h3>
              <div className="grid gap-2">
                {day.activities.map((activity) => (
                  <ActivityRow key={activity.id} event={event} activity={activity} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="mt-6 border-t border-black/10 pt-5 dark:border-white/10">
        <ActivityForm
          submitLabel={queued ? 'Enviar al ayuntamiento' : 'Añadir actividad'}
          categories={categories}
          event={event}
          timeZone={timeZone}
          onSubmit={(draft) => createActivity(event.id, draft)}
        />
      </div>
    </Card>
  );
}

/**
 * One line, as the panel shows it.
 *
 * Collapsed to what it says and what it inherits; the edit form only appears
 * when somebody asks for it. A feria with twenty lines all showing eight fields
 * is not a programme any more, it is a wall.
 */
function ActivityRow({ event, activity }: { event: Event; activity: Activity }) {
  const {
    approveActivity,
    cancelActivity,
    categories,
    deleteActivity,
    municipality,
    rejectActivity,
    role,
    updateActivity,
  } = usePanel();

  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [failed, setFailed] = useState<string | null>(null);

  const timeZone = municipality?.timeZone ?? 'Europe/Madrid';
  const context = { now: new Date(), timeZone, locale: 'es' as const };
  const defaults = activityDefaults(event);
  const price = activityPrice(activity, defaults);
  const municipal = role === 'municipal_editor' || role === 'municipal_admin';
  const waiting = isActivityAwaitingReview(activity);

  const category =
    activity.categoryId === null
      ? null
      : (categories.find((entry) => entry.id === activity.categoryId)?.name ?? null);

  // Only what it does not inherit. Twelve rows repeating the same square is how
  // the two that are somewhere else get missed.
  const meta = [
    activityHasOwnLocation(activity, defaults) ? activity.location?.name : null,
    category,
    price.isFree ? null : price.priceInfo,
  ].filter((part): part is string => part !== null && part !== undefined && part !== '');

  const marks = reportableCount(activity.interestCount);

  function run(action: () => Promise<void>) {
    setFailed(null);
    void action().catch((error: unknown) => {
      setFailed(error instanceof Error ? error.message : 'No se ha podido guardar.');
    });
  }

  return (
    <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="w-20 shrink-0 font-semibold tabular-nums">
            {formatTime(activity.startAt, context)}
            {activity.endAt === null ? '' : `–${formatTime(activity.endAt, context)}`}
          </span>
          <div className="min-w-0">
            <p className={`font-medium ${activity.status === 'cancelled' ? 'line-through' : ''}`}>
              {activity.title}
            </p>
            {meta.length === 0 ? null : (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{meta.join(' · ')}</p>
            )}
            {marks === null ? null : (
              <p className="mt-1 text-xs text-neutral-500">
                A {marks} vecinos les interesa esta actividad
              </p>
            )}
            {activity.rejectionReason === null ? null : (
              <p className="mt-1 text-xs text-red-700 dark:text-red-400">
                Rechazada: {activity.rejectionReason}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {activity.pendingPatch === null ? (
            <StatusBadge status={activity.status} />
          ) : (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
              Cambio pendiente
            </span>
          )}
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className="text-sm font-semibold underline"
          >
            {editing ? 'Cerrar' : 'Editar'}
          </button>
          {activity.status === 'cancelled' ? null : (
            <button
              type="button"
              onClick={() => run(() => cancelActivity(event.id, activity.id))}
              className="text-sm font-semibold underline"
            >
              Cancelar
            </button>
          )}
          {asking ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-600">
                {activity.status === 'published'
                  ? 'Los vecinos ya la han visto. Se borra sin avisarles.'
                  : 'No se puede deshacer.'}
              </span>
              <Button
                variant="danger"
                onClick={() => run(() => deleteActivity(event.id, activity.id))}
              >
                Borrar
              </Button>
              <Button variant="secondary" onClick={() => setAsking(false)}>
                Mejor no
              </Button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setAsking(true)}
              className="text-sm font-semibold text-red-700 underline"
            >
              Borrar
            </button>
          )}
        </div>
      </div>

      {failed === null ? null : (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700 dark:text-red-400">
          {failed}
        </p>
      )}

      {/* The town hall's decision on a line an association sent, or on a change
          they asked for on one the neighbours are already reading. */}
      {municipal && waiting ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/10 pt-3 dark:border-white/10">
          <Button
            brand={municipality?.branding.primaryColor}
            onClick={() => run(() => approveActivity(event.id, activity.id))}
          >
            {activity.pendingPatch === null ? 'Aprobar y publicar' : 'Aprobar el cambio'}
          </Button>
          {rejecting ? (
            <>
              <Input
                value={reason}
                onChange={(change) => setReason(change.target.value)}
                placeholder="Motivo del rechazo"
                aria-label="Motivo del rechazo"
              />
              <Button
                variant="danger"
                disabled={reason.trim() === ''}
                onClick={() => {
                  run(() => rejectActivity(event.id, activity.id, reason.trim()));
                  setRejecting(false);
                  setReason('');
                }}
              >
                Rechazar
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setRejecting(true)}>
              Rechazar
            </Button>
          )}
        </div>
      ) : null}

      {editing ? (
        <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/10">
          <ActivityForm
            activity={activity}
            categories={categories}
            event={event}
            timeZone={timeZone}
            submitLabel="Guardar cambios"
            onSubmit={async (draft) => {
              await updateActivity(event.id, activity.id, draft);
              setEditing(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The form for one line, used both to add and to edit.
 *
 * One component for both because the fields are identical and two would drift on
 * the one thing that matters here: which of them mean "same as the event".
 *
 * The date defaults to the event's own start, since a feria's programme is
 * almost always inside it — which turns adding the eighth line into typing a
 * time and a title.
 */
function ActivityForm({
  activity,
  categories,
  event,
  timeZone,
  submitLabel,
  onSubmit,
}: {
  activity?: Activity;
  categories: readonly { id: string; name: string }[];
  event: Event;
  timeZone: string;
  submitLabel: string;
  onSubmit: (draft: NewActivityInput) => Promise<void>;
}) {
  const start = activity ? toLocalParts(activity.startAt, timeZone) : null;
  const end = activity?.endAt ? toLocalParts(activity.endAt, timeZone) : null;
  const eventStart = toLocalParts(event.startAt, timeZone);

  const [title, setTitle] = useState(activity?.title ?? '');
  const [description, setDescription] = useState(activity?.description ?? '');
  const [date, setDate] = useState(start?.date ?? eventStart.date);
  const [startTime, setStartTime] = useState(start?.timeOfDay ?? '');
  const [endTime, setEndTime] = useState(end?.timeOfDay ?? '');
  const [categoryId, setCategoryId] = useState(activity?.categoryId ?? '');
  const [placeName, setPlaceName] = useState(activity?.location?.name ?? '');
  /**
   * Whether this line says anything about money at all.
   *
   * Three states in two controls: off means "same as the event", which is what
   * `isFree: null` is; on means this line has its own answer. A single checkbox
   * could not tell "free" from "inherits a free event", and the difference
   * matters the day the town hall makes the feria paid.
   */
  const [ownPrice, setOwnPrice] = useState(activity?.isFree !== null && activity !== undefined);
  const [isFree, setIsFree] = useState(activity?.isFree ?? true);
  const [priceInfo, setPriceInfo] = useState(activity?.priceInfo ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function clear() {
    setTitle('');
    setDescription('');
    setStartTime('');
    setEndTime('');
    setPlaceName('');
    setCategoryId('');
    setOwnPrice(false);
    setIsFree(true);
    setPriceInfo('');
  }

  async function submit() {
    if (!title.trim() || !date || !startTime) {
      setError('Faltan el título, la fecha o la hora de inicio.');

      return;
    }

    const startAt = parseLocalDateTime(date, startTime, timeZone);
    let endAt = endTime ? parseLocalDateTime(date, endTime, timeZone) : null;

    // A workshop running from 23:00 to 00:30 finishes the next day.
    if (endAt && endAt.getTime() < startAt.getTime()) {
      endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
    }

    setError(null);
    setSaving(true);

    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        categoryId: categoryId === '' ? null : categoryId,
        startAt,
        endAt,
        location:
          placeName.trim() === ''
            ? null
            : {
                name: placeName.trim(),
                // An activity in another building has no coordinates of its own
                // until somebody gives it any; the event's map is what the app
                // shows either way.
                latitude: event.location.latitude,
                longitude: event.location.longitude,
              },
        isFree: ownPrice ? isFree : null,
        priceInfo: ownPrice && !isFree ? priceInfo.trim() || null : null,
      });

      // Only when adding: an edit closes itself, and clearing the form somebody
      // just corrected would look like the save was lost.
      if (activity === undefined) clear();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : 'No se ha podido guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(submitEvent) => {
        submitEvent.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <Field label="Actividad" required>
          <Input
            value={title}
            onChange={(change) => setTitle(change.target.value)}
            placeholder="Show de aves rapaces"
          />
        </Field>
        <Field label="Hora de inicio" required>
          <Input
            type="time"
            value={startTime}
            onChange={(change) => setStartTime(change.target.value)}
          />
        </Field>
        <Field label="Hora de fin">
          <Input
            type="time"
            value={endTime}
            onChange={(change) => setEndTime(change.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Día" required>
          <Input type="date" value={date} onChange={(change) => setDate(change.target.value)} />
        </Field>
        <Field label="Categoría" hint="En blanco, la del evento.">
          <Select value={categoryId} onChange={(change) => setCategoryId(change.target.value)}>
            <option value="">La del evento</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Lugar" hint="En blanco, el del evento.">
          <Input
            value={placeName}
            onChange={(change) => setPlaceName(change.target.value)}
            placeholder={event.location.name}
          />
        </Field>
      </div>

      <Field label="Descripción">
        <TextArea
          value={description}
          onChange={(change) => setDescription(change.target.value)}
          rows={2}
          placeholder="Lo que el vecino necesita saber para venir a esta actividad."
        />
      </Field>

      <div className="flex flex-wrap items-center gap-4">
        <Checkbox
          label="Precio distinto al del evento"
          hint="Para el taller que se paga aparte dentro de una feria gratuita, o al revés."
          checked={ownPrice}
          onChange={setOwnPrice}
        />
        {ownPrice ? (
          <Checkbox label="Esta actividad es gratuita" checked={isFree} onChange={setIsFree} />
        ) : null}
      </div>

      {ownPrice && !isFree ? (
        <Field label="Precio de la actividad">
          <Input
            value={priceInfo}
            onChange={(change) => setPriceInfo(change.target.value)}
            placeholder="5 € por persona"
          />
        </Field>
      ) : null}

      {error === null ? null : (
        <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <div>
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
