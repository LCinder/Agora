'use client';

import type { ReactNode } from 'react';

/**
 * The data screen, in the language of a printed report.
 *
 * Everything else in the panel is a working surface: lists you filter, forms
 * you fill, a review tray you clear. This screen is the only one nobody
 * *operates* — it is read, and then it is read again out loud to somebody who
 * controls a budget. So it stops being a grid of cards and becomes a document:
 * one figure that leads, the rest ruled underneath it, sections separated by
 * hairlines instead of boxes.
 *
 * The practical reason is the same one that made the panel light-only: this
 * screen gets projected onto a meeting-room wall. Five bordered tiles of equal
 * weight force the room to hunt for the number that matters. A lead figure
 * tells them where to look from the back of the room.
 */

/** A hairline. The report's only divider. */
export function Rule({ className = '' }: { className?: string }) {
  return <hr className={`border-0 border-t border-black/10 ${className}`} />;
}

/**
 * A titled band of the report.
 *
 * No border, no radius, no shadow — the rule above it and the space around it
 * are what separate one from the next. Cards were doing that job and doing it
 * badly: when every block is a card, none of them is.
 */
export function Band({
  title,
  note,
  children,
  hidden = false,
}: {
  title: string;
  /** One sentence under the heading, when the subject is not obvious. */
  note?: string;
  children: ReactNode;
  hidden?: boolean;
}) {
  if (hidden) return null;

  return (
    <section className="mt-10">
      <Rule className="mb-5" />
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {note === undefined ? null : (
        <p className="mt-1 max-w-[62ch] text-sm text-neutral-600">{note}</p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * The number the councillor came for, and the ones that qualify it.
 *
 * `lead` is set at a size that reads across a room; the rest sit in a ruled
 * column beside it, in reading order, with the same type as the body. That
 * asymmetry is the point: it says which figure is the answer and which ones
 * are context, without a single word of explanation.
 */
export function Headline({
  label,
  value,
  hint,
  aside,
}: {
  label: string;
  value: string;
  hint?: string;
  aside: ReactNode;
}) {
  return (
    <div className="grid gap-x-10 gap-y-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div>
        <p className="text-sm text-neutral-600">{label}</p>
        <p className="font-display text-6xl leading-none font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        {hint === undefined ? null : <p className="mt-2 text-sm text-neutral-600">{hint}</p>}
      </div>

      <dl className="grid gap-0">{aside}</dl>
    </div>
  );
}

/** One line of the ruled column beside the lead figure. */
export function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-black/10 py-2.5 first:border-t-0">
      <dt className="text-sm text-neutral-700">
        {label}
        {hint === undefined ? null : <span className="block text-xs text-neutral-500">{hint}</span>}
      </dt>
      <dd className="font-display text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * A ranked list with the bar drawn under the name.
 *
 * This replaces a horizontal bar chart, and it is better for this data for
 * reasons that have nothing to do with taste. The labels are event titles —
 * "Feria: noche del alumbrado" — and a chart axis truncates them at whatever
 * width the container allows, so the reader gets a bar next to half a sentence.
 * Here the name has the full width, the bar sits under it, and the figure is
 * right-aligned where a number belongs.
 *
 * It is also the same shape the dossier uses for this exact chart, so what a
 * councillor is handed on paper and what they see on the screen agree.
 */
export function Ranking({
  rows,
  colour,
  unit,
}: {
  rows: readonly { name: string; value: number; colour?: string }[];
  /** Fallback bar colour: the municipality's own, already lifted for contrast. */
  colour: string;
  /** Read out to a screen reader after the figure. */
  unit: string;
}) {
  const top = Math.max(...rows.map((row) => row.value), 1);

  return (
    <ol className="grid gap-3.5">
      {rows.map((row) => (
        <li key={row.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4">
          <p className="truncate text-sm">{row.name}</p>
          <p className="font-display text-sm font-semibold tabular-nums">
            {row.value.toLocaleString('es-ES')}
            <span className="sr-only"> {unit}</span>
          </p>
          <div className="col-span-2 mt-1.5 h-1.5 rounded-full bg-black/5">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, Math.round((row.value / top) * 100))}%`,
                backgroundColor: row.colour ?? colour,
              }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
