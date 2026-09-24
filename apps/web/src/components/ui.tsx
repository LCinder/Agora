'use client';

import { CircleAlert, Loader2, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type {
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

/* Hallmark · component: panel primitives · genre: editorial · theme: design.md
 * states: default · hover · focus · active · disabled · loading · error · success
 */

/**
 * Panel primitives.
 *
 * The municipal officer using this has little time and no training, so the
 * shapes are ordinary: labelled fields, visible focus rings, buttons that say
 * what they do. Nothing here relies on colour alone to carry meaning, which
 * RD 1112/2018 requires of anything sold to a public administration.
 *
 * What made these look unfinished was not missing ornament, it was missing
 * states. A control that draws the same whether you are hovering it, holding
 * it down, waiting on it or have just typed something invalid into it reads as
 * a picture of a control. Every interactive primitive here now answers all
 * eight: default, hover, focus, active, disabled, loading, error, success.
 */

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/**
 * The surface a thing you act on sits on.
 *
 * `title` exists because half the panel was writing an `h2` as the first child
 * and then a gap, which is a header drawn by hand and drawn slightly
 * differently each time. Given to the card, it comes with the hairline under
 * it and a slot on the right for the action that belongs to that block.
 *
 * `tone` is the one piece of colour a card carries, and only when the row's
 * state is the point: something waiting on the reader, or something that went
 * wrong. Never for decoration — see design.md.
 */
export function Card({
  children,
  title,
  action,
  tone = 'plain',
  className = '',
}: {
  children: ReactNode;
  title?: string;
  /** Sits opposite the title, for the action that belongs to this block. */
  action?: ReactNode;
  tone?: 'plain' | 'waiting' | 'danger';
  className?: string;
}) {
  const edge =
    tone === 'waiting'
      ? 'border-amber-300/70 bg-amber-50/40'
      : tone === 'danger'
        ? 'border-red-300/70 bg-red-50/40'
        : 'border-black/[0.07] bg-surface dark:border-white/10 dark:bg-neutral-900';

  return (
    /*
     * La sombra es de un píxel y casi negra al 4 %: no es un efecto, es lo que
     * hace que el borde se lea como un canto y no como una raya dibujada. Una
     * sombra difusa y de color sería un adorno, y este panel se imprime.
     */
    <div
      className={`rounded-xl border p-5 shadow-[0_1px_2px_rgba(16,16,26,0.04)] ${edge} ${className}`}
    >
      {title === undefined ? null : (
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 border-b border-black/10 pb-3">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Everything a control looks like before it is told what kind it is.
 *
 * Shared so that a `Link` styled as a button cannot quietly lose the focus
 * ring, which is what had already happened twice: the primary button was
 * copied by hand into two pages and the `focus-visible` did not come with it.
 */
/*
 * The hit target of an icon action.
 *
 * 44 px square even though the icon is 18, because a finger is not a cursor and
 * this panel is used on a tablet in a meeting as often as on a laptop. The
 * focus ring comes from here, like everywhere else.
 */
const iconBase =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-lg transition ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40';

const controlBase =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold ' +
  // `active:translate-y-px` and nothing more: a control that gives way a single
  // pixel under the finger feels answered. A scale or a bounce on a municipal
  // form feels like a toy — see design.md, and the skill's own ban on
  // universal hover:scale.
  'transition-[background-color,border-color,color,translate] duration-150 active:translate-y-px ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'disabled:pointer-events-none disabled:opacity-50';

export function Button({
  children,
  icon: Icon,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled = false,
  busy = false,
  brand,
}: {
  children: ReactNode;
  /** Beside the label, never instead of it: this is a named action. */
  icon?: LucideIcon;
  /**
   * Waiting on something.
   *
   * The label does not change and the button does not shrink: a control that
   * swaps its words for "Guardando…" moves the layout under a finger that is
   * still on it. The spinner takes the icon's place and `aria-busy` says the
   * same thing out loud.
   */
  busy?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  brand?: string | undefined;
}) {
  const base = controlBase;

  if (variant === 'primary') {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        className={`${base} gap-2 text-white`}
        style={{ backgroundColor: brand ?? '#4F46E5' }}
      >
        <Ornament icon={Icon} busy={busy} />
        {children}
      </button>
    );
  }

  const styles =
    variant === 'danger'
      ? 'border border-red-600 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950'
      : 'border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`${base} gap-2 ${styles}`}
    >
      <Ornament icon={Icon} busy={busy} />
      {children}
    </button>
  );
}

/**
 * A link that looks like the primary button, because it goes somewhere.
 *
 * "Nuevo evento" navigates; it does not act. A `<button>` that routes is a lie
 * to a screen reader and takes the middle-click and the open-in-new-tab away
 * from everybody else. So it stays an anchor and borrows the button's clothes
 * — including the focus ring, which is the part that kept getting lost when
 * this was copied by hand.
 */
export function ButtonLink({
  href,
  children,
  icon: Icon,
  brand,
}: {
  href: string;
  children: ReactNode;
  icon?: LucideIcon;
  /** The municipality's own colour, when the page knows it. */
  brand?: string | undefined;
}) {
  return (
    <Link
      href={href}
      className={`${controlBase} gap-2 text-white`}
      style={{ backgroundColor: brand ?? '#4F46E5' }}
    >
      {Icon === undefined ? null : <Icon size={16} strokeWidth={2} aria-hidden />}
      {children}
    </Link>
  );
}

/**
 * An action drawn as an icon, with its name carried where it counts.
 *
 * A row that repeats the word "Editar" eleven times spends eleven times the
 * width on a word the reader already knows, and the eye has to read it to find
 * the target. The icon is the target; the name is still there for anybody who
 * needs it — `aria-label` for a screen reader, `title` for the pointer.
 *
 * `label` is required and not optional on purpose. An icon-only control without
 * an accessible name is a button that announces itself as "button", and RD
 * 1112/2018 is the floor this product is sold on. There is no way to build one
 * of these wrong.
 *
 * One icon set across the whole panel — lucide — because two sets is the
 * tell that gives away a stitched-together interface.
 */
export function IconButton({
  icon: Icon,
  label,
  onClick,
  tone = 'plain',
  disabled = false,
}: {
  icon: LucideIcon;
  /** What it does, in words. Never optional. */
  label: string;
  onClick?: () => void;
  tone?: 'plain' | 'danger';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`${iconBase} ${
        tone === 'danger'
          ? 'text-red-700 hover:bg-red-50 hover:text-red-800'
          : 'text-neutral-600 hover:bg-black/5 hover:text-neutral-900'
      }`}
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

/** The same, for an action that is really a destination. */
export function IconLink({
  icon: Icon,
  label,
  href,
}: {
  icon: LucideIcon;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={`${iconBase} text-neutral-600 hover:bg-black/5 hover:text-neutral-900`}
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden />
    </Link>
  );
}

/** The icon slot of a button: the icon, or the spinner that replaces it. */
function Ornament({ icon: Icon, busy }: { icon?: LucideIcon | undefined; busy: boolean }) {
  if (busy) {
    return (
      <Loader2
        size={16}
        strokeWidth={2}
        aria-hidden
        className="motion-safe:animate-spin motion-reduce:opacity-60"
      />
    );
  }

  return Icon === undefined ? null : <Icon size={16} strokeWidth={2} aria-hidden />;
}

export function Field({
  label,
  hint,
  error,
  required = false,
  hidden = false,
  children,
}: {
  label: string;
  hint?: string;
  /**
   * What is wrong with what was typed.
   *
   * It replaces the hint rather than stacking under it: two lines of small grey
   * text with one of them red is how a form ends up telling somebody two things
   * at once and neither of them clearly.
   */
  error?: string | null;
  required?: boolean;
  /** For a field that does not apply to whoever is looking at the form. */
  hidden?: boolean;
  children: ReactNode;
}) {
  if (hidden) return null;

  const wrong = error !== undefined && error !== null && error !== '';

  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">
        {label}
        {required ? (
          <span className="ml-1 text-red-600" title="Obligatorio">
            *
          </span>
        ) : null}
      </span>
      {children}
      {wrong ? (
        <span className="mt-1 flex items-start gap-1.5 text-xs font-medium text-red-700">
          <CircleAlert size={14} strokeWidth={2} aria-hidden className="mt-px shrink-0" />
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-neutral-600 dark:text-neutral-400">{hint}</span>
      ) : null}
    </label>
  );
}

/*
 * The focus ring is not decoration here.
 *
 * The button has had one since the first day and the fields never did, so
 * somebody moving through the form with the keyboard got whatever the browser
 * draws by default — which over a `black/15` border is sometimes barely there.
 * RD 1112/2018 is what this panel is sold on, and an automated check does not
 * catch it: axe verifies that contrast exists, not that focus is visible.
 */
const controlClass =
  'w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 text-sm ' +
  'transition-[border-color,background-color] duration-150 hover:border-black/30 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  // The invalid state is drawn from `aria-invalid`, which `Field` sets, so the
  // thing a screen reader announces and the thing the eye sees cannot drift
  // apart — there is no separate `isError` class to forget.
  'aria-invalid:border-red-600 aria-invalid:bg-red-50/50 ' +
  'disabled:cursor-not-allowed disabled:bg-black/5 disabled:text-neutral-600 ' +
  'dark:border-white/20 dark:bg-neutral-950';

export function Input({
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} className={controlClass} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${controlClass} py-2`} rows={props.rows ?? 4} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={controlClass} />;
}

export function Checkbox({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  /** For a switch whose consequence is not obvious from its name. */
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex min-h-11 items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4"
      />
      <span>
        {label}
        {hint === undefined ? null : (
          <span className="block text-xs text-neutral-600 dark:text-neutral-400">{hint}</span>
        )}
      </span>
    </label>
  );
}

/**
 * Which category an event belongs to, in its own colour.
 *
 * The colour is the one the app paints that category with and the one the
 * dossier prints, so a technician who has seen the calendar on a phone
 * recognises the row without reading it. That is the whole justification: the
 * colour is the category, not decoration. The name is written beside it because
 * nothing in this panel may depend on colour alone.
 *
 * A dot rather than a filled chip on purpose. Eleven filled chips down a list
 * turn the page into a paint sample and start competing with the status badge,
 * which is the thing that actually needs to be noticed.
 */
export function CategoryChip({ name, colour }: { name: string; colour: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: colour }}
      />
      {name}
    </span>
  );
}

const STATUS_LABELS = {
  draft: 'Borrador',
  pending_review: 'Pendiente de revisión',
  published: 'Publicado',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
} as const;

/*
 * Fondo muy claro, anillo del mismo tono y un punto a plena intensidad.
 *
 * El relleno pastel de antes competía con el texto de la fila por la misma
 * atención: media docena de bloques de color saturado en una lista y el ojo no
 * sabe dónde mirar. Así el estado se distingue igual de lejos, pesa mucho menos
 * de cerca, y el punto da un segundo indicio además del color — que sigue sin
 * ser nunca el único, porque la palabra está escrita al lado.
 */
const STATUS_CLASSES = {
  draft: 'bg-neutral-50 text-neutral-700 ring-neutral-300',
  pending_review: 'bg-amber-50 text-amber-800 ring-amber-300',
  published: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  rejected: 'bg-neutral-50 text-neutral-700 ring-neutral-300',
  cancelled: 'bg-red-50 text-red-800 ring-red-300',
} as const;

const STATUS_DOTS = {
  draft: 'bg-neutral-400',
  pending_review: 'bg-amber-500',
  published: 'bg-emerald-600',
  rejected: 'bg-neutral-500',
  cancelled: 'bg-red-600',
} as const;

export function StatusBadge({ status }: { status: keyof typeof STATUS_LABELS }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_CLASSES[status]}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${STATUS_DOTS[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

/*
 * Lo primero que ve un ayuntamiento el primer día.
 *
 * Era una frase gris dentro de una caja, y es la primera impresión del producto
 * para quien acaba de entrar y todavía no tiene nada. El filete discontinuo dice
 * «aquí va a haber algo» en vez de «aquí no hay nada», que es la diferencia
 * entre un hueco y una avería.
 */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-black/15 bg-surface/60 px-6 py-10 text-center">
      <p className="mx-auto max-w-[46ch] text-sm text-neutral-600 dark:text-neutral-400">
        {children}
      </p>
    </div>
  );
}
