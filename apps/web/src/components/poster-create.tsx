'use client';

import { formatLongDate, formatTime, parseLocalDateTime } from '@agora/core';
import { useState } from 'react';

import { usePanel } from '../lib/panel-store';
import { composePoster } from '../lib/poster-canvas';
import { type PosterDrawing, callPoster, posterError } from '../lib/poster-contract';
import { Button, Field, Select, TextArea } from './ui';

/**
 * Draw the poster.
 *
 * For the events that arrive without one: an association's talk, a small
 * concert, a workshop. The officer writes what the event is, in the words they
 * would use out loud, and gets a poster back.
 */

export type PosterSubject = {
  title: string;
  date: string;
  startTime: string;
  locationName: string;
};

type Mode = 'background' | 'complete';

type State =
  | { status: 'idle' }
  | { status: 'drawing' }
  | { status: 'done'; mode: Mode; image: string; altText: string; prompt: string }
  | { status: 'error'; message: string };

const MODE_LABELS: Record<Mode, string> = {
  background: 'Fondo dibujado y texto compuesto (recomendado)',
  complete: 'Cartel entero dibujado, texto incluido',
};

export function PosterCreate({
  subject,
  onPoster,
}: {
  subject: PosterSubject;
  onPoster: (image: { mimeType: string; data: string }) => void;
}) {
  const { municipality } = usePanel();
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<Mode>('background');
  const [state, setState] = useState<State>({ status: 'idle' });
  const [used, setUsed] = useState(false);

  const timeZone = municipality?.timeZone ?? 'Europe/Madrid';

  function labels(): { dateLabel: string; timeLabel: string } {
    if (!subject.date || !subject.startTime) return { dateLabel: '', timeLabel: '' };

    const startAt = parseLocalDateTime(subject.date, subject.startTime, timeZone);
    const context = { now: new Date(), timeZone, locale: 'es' as const };

    return { dateLabel: formatLongDate(startAt, context), timeLabel: formatTime(startAt, context) };
  }

  async function draw() {
    if (description.trim().length < 3) {
      setState({
        status: 'error',
        message: 'Describe primero qué quieres que salga en el cartel.',
      });
      return;
    }

    setState({ status: 'drawing' });
    setUsed(false);

    const { dateLabel, timeLabel } = labels();

    try {
      const response = await callPoster('draw', {
        description: description.trim(),
        mode,
        event: {
          title: subject.title,
          dateLabel,
          timeLabel,
          locationName: subject.locationName,
          municipalityName: municipality?.name ?? '',
        },
      });

      const payload: unknown = await response.json();

      if (!response.ok) {
        setState({
          status: 'error',
          message: posterError(response, payload, 'No hemos podido dibujar el cartel.'),
        });
        return;
      }

      const drawing = payload as PosterDrawing;
      const drawn = `data:${drawing.image.mimeType};base64,${drawing.image.data}`;

      const image =
        mode === 'background'
          ? await composePoster(drawn, {
              title: subject.title,
              dateLabel,
              timeLabel,
              locationName: subject.locationName,
              municipalityName: municipality?.name ?? '',
              logoUrl: municipality?.branding.logoUrl ?? null,
              primaryColor: municipality?.branding.primaryColor ?? '#4F46E5',
            })
          : drawn;

      setState({
        status: 'done',
        mode,
        image,
        altText: drawing.altText,
        prompt: drawing.imagePrompt,
      });
    } catch {
      setState({ status: 'error', message: 'No hemos podido conectar para dibujar el cartel.' });
    }
  }

  const fileName = `cartel-${
    subject.title
      ? subject.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      : 'evento'
  }.jpg`;

  return (
    <div>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Escribe qué es el evento y te lo dibujamos. Rellena antes el título, la fecha y el lugar: se
        componen sobre el cartel.
      </p>

      <div className="mt-4 grid gap-4">
        <Field
          label="Qué quieres que salga"
          hint="Con una frase basta: «concurso de tortillas en la plaza del pueblo, por la mañana, ambiente familiar»."
        >
          <TextArea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe el cartel…"
          />
        </Field>

        <Field
          label="Cómo se hace"
          hint={
            mode === 'background'
              ? 'El título, la fecha y el lugar los escribe el panel con los datos del formulario, así que salen siempre bien.'
              : 'El texto lo escribe la IA dentro de la imagen. Repásalo con atención antes de publicar: puede equivocarse en fechas y tildes.'
          }
        >
          <Select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
            {Object.entries(MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <Button
            onClick={() => void draw()}
            disabled={state.status === 'drawing'}
            brand={municipality?.branding.primaryColor}
          >
            {state.status === 'drawing' ? 'Dibujando el cartel…' : 'Dibujar cartel'}
          </Button>
        </div>
      </div>

      {state.status === 'done' ? (
        <div className="mt-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- the poster is
              generated in the browser and lives in a data URL, which is not
              something next/image can optimise. */}
          <img
            src={state.image}
            alt={state.altText}
            className="w-full max-w-sm rounded-lg border border-black/10 dark:border-white/10"
          />

          {state.mode === 'complete' ? (
            <p className="mt-3 text-sm text-amber-800 dark:text-amber-400">
              Léelo entero antes de usarlo. El texto lo ha escrito la IA y las fechas son lo que más
              se le suele torcer.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              brand={municipality?.branding.primaryColor}
              onClick={() => {
                // What is on screen, not what came back from the model: in
                // "background" mode the panel has drawn the title, the date and
                // the place over it, and that composed image is the poster.
                const [prefix, data] = state.image.split(',');
                const mimeType = /data:([^;]+)/.exec(prefix ?? '')?.[1] ?? 'image/jpeg';

                if (data !== undefined) {
                  onPoster({ mimeType, data });
                  setUsed(true);
                }
              }}
            >
              {used ? 'Puesto en el evento' : 'Usar en el evento'}
            </Button>
            <a
              href={state.image}
              download={fileName}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-black/15 px-4 text-sm font-semibold hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Descargar cartel
            </a>
            <Button variant="secondary" onClick={() => void draw()}>
              Dibujar otro
            </Button>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-neutral-600 dark:text-neutral-400">
              Ver lo que se le ha pedido a la IA
            </summary>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{state.prompt}</p>
          </details>
        </div>
      ) : null}

      {state.status === 'error' ? (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
