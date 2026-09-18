'use client';

import { useRef, useState } from 'react';

import { usePanel } from '../lib/panel-store';
import { type PosterReading, posterEndpoint } from '../lib/poster-contract';
import { Button } from './ui';

/**
 * Poster import.
 *
 * The town hall gets its programme as posters, not as structured data, so the
 * fastest way to fill the calendar is to accept the poster. The extraction
 * always lands in the form for a person to check before publishing; nothing
 * here publishes on its own.
 */

type State =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'done'; confidence: PosterReading['confidence'] }
  | { status: 'error'; message: string };

export function PosterImport({ onRead }: { onRead: (reading: PosterReading) => void }) {
  const { municipality } = usePanel();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ status: 'idle' });

  async function read(file: File) {
    setState({ status: 'reading' });

    const body = new FormData();
    body.append('poster', file);

    try {
      const response = await fetch(posterEndpoint('read'), { method: 'POST', body });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof payload === 'object' && payload !== null && 'message' in payload
            ? String((payload as { message: unknown }).message)
            : 'No hemos podido leer el cartel.';

        setState({ status: 'error', message });
        return;
      }

      const reading = payload as PosterReading;
      onRead(reading);
      setState({ status: 'done', confidence: reading.confidence });
    } catch {
      setState({ status: 'error', message: 'No hemos podido conectar para leer el cartel.' });
    }
  }

  return (
    <div>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Sube la foto del cartel y rellenamos el formulario. Revísalo antes de publicar.
      </p>

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void read(file);
        }}
      />

      <div className="mt-4">
        <Button
          onClick={() => input.current?.click()}
          disabled={state.status === 'reading'}
          brand={municipality?.branding.primaryColor}
        >
          {state.status === 'reading' ? 'Leyendo el cartel…' : 'Subir cartel'}
        </Button>
      </div>

      {state.status === 'done' ? (
        <p className="mt-3 text-sm">
          Datos rellenados.{' '}
          {state.confidence === 'high'
            ? 'Revisa que la fecha y el lugar sean correctos.'
            : 'La fecha no estaba clara en el cartel: compruébala con atención.'}
        </p>
      ) : null}

      {state.status === 'error' ? (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
