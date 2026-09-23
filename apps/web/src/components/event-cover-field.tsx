'use client';

import { useRef, useState } from 'react';

import { imagePayload } from '../lib/poster-contract';
import { Button } from './ui';

/**
 * The poster of an event, in the form.
 *
 * The event model has carried an `imageUrl` since the first day and nothing
 * could ever set it: the seed filled it for the demo towns and every event a
 * town hall created went out with no poster, so the app drew its fallback cover
 * for all of them. This is the control that was missing.
 *
 * It does not upload anything. The image is held by the form until the event is
 * saved, for two reasons: a new event has no id yet to attach one to, and
 * uploading on pick would leave a poster in the bucket for an event somebody
 * then abandoned.
 */

/** Nothing chosen, an image waiting to be saved, or "take the current one off". */
export type PendingPoster = { mimeType: string; data: string } | 'remove' | null;

/**
 * What the browser will accept in the picker.
 *
 * The same three the API stores. A HEIC straight off an iPhone is not in the
 * list on purpose: `imagePayload` re-encodes what it can to JPEG through a
 * canvas, and what it cannot it sends as-is, which the API would then refuse
 * with a message rather than storing something nothing can display.
 */
const ACCEPT = 'image/jpeg,image/png,image/webp';

export function EventCoverField({
  current,
  pending,
  onChange,
}: {
  /** What the event has now, or null. */
  current: string | null;
  pending: PendingPoster;
  onChange: (poster: PendingPoster) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // What to draw: the one just chosen, or the one already on the event, unless
  // it is on its way out.
  const shown = preview ?? (pending === 'remove' ? null : current);

  async function choose(file: File) {
    setBusy(true);

    try {
      // The same shrinking the poster reader uses, and for the same reason: a
      // photo off a modern phone is twelve megapixels, and a poster on a
      // calendar card does not need more than about 1,500 pixels.
      const image = await imagePayload(file);

      onChange(image);
      setPreview(`data:${image.mimeType};base64,${image.data}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-medium">Cartel</span>

      <div className="flex flex-wrap items-start gap-4">
        {shown === null ? (
          <div className="flex h-32 w-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-black/20 text-xs text-neutral-500">
            Sin cartel
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- one is a data
             URL from the browser and the other is on a CloudFront path; neither
             is something next/image can optimise in a static export. */
          <img
            src={shown}
            alt="Cartel del evento"
            className="h-32 w-24 shrink-0 rounded-lg border border-black/10 object-cover"
          />
        )}

        <div className="grid gap-2">
          <p className="text-sm text-neutral-600">
            Sale en la portada de la aplicación, en la página pública del evento y en la vista
            previa cuando alguien lo comparte por WhatsApp. Si no pones ninguno, la aplicación
            dibuja una portada con el color de la categoría.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? 'Preparando…' : shown === null ? 'Subir cartel' : 'Cambiar cartel'}
            </Button>

            {shown === null ? null : (
              <Button
                variant="secondary"
                onClick={() => {
                  onChange('remove');
                  setPreview(null);

                  // Or picking the same file again after removing it does
                  // nothing: the input still holds it, so there is no change
                  // event to react to.
                  if (input.current !== null) input.current.value = '';
                }}
              >
                Quitar
              </Button>
            )}
          </div>

          <p className="text-xs text-neutral-500">
            JPG, PNG o WEBP. Se guarda al darle a guardar el evento, como todo lo demás.
          </p>
        </div>
      </div>

      {/* The button above is the control. This is how it reaches the picker, and
          it is out of the tab order so that somebody using a screen reader does
          not meet two controls that do one job (D-064).

          `aria-hidden` finishes that thought. `sr-only` hides it from eyes but
          leaves it in the accessibility tree, so a screen reader still found an
          unlabelled file field — which is what the WCAG check was failing on.
          Labelling it would have put back the second control this deliberately
          removes, so the honest answer is that this input is plumbing and not a
          control at all. It is safe: `tabIndex={-1}` means nothing focusable is
          being hidden, which is the case aria-hidden must never cover. */}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        name="cartel"
        aria-hidden="true"
        tabIndex={-1}
        className="sr-only"
        onChange={(changeEvent) => {
          const file = changeEvent.target.files?.[0];

          if (file !== undefined) void choose(file);
        }}
      />
    </div>
  );
}
