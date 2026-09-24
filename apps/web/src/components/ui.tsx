'use client';

import Link from 'next/link';
import type {
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

/**
 * Panel primitives.
 *
 * The municipal officer using this has little time and no training, so the
 * shapes are ordinary: labelled fields, visible focus rings, buttons that say
 * what they do. Nothing here relies on colour alone to carry meaning, which
 * RD 1112/2018 requires of anything sold to a public administration.
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

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-neutral-900 ${className}`}
    >
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
const controlBase =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold ' +
  'transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50';

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled = false,
  brand,
}: {
  children: ReactNode;
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
        disabled={disabled}
        className={`${base} text-white`}
        style={{ backgroundColor: brand ?? '#4F46E5' }}
      >
        {children}
      </button>
    );
  }

  const styles =
    variant === 'danger'
      ? 'border border-red-600 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950'
      : 'border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10';

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
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
  brand,
}: {
  href: string;
  children: ReactNode;
  /** The municipality's own colour, when the page knows it. */
  brand?: string | undefined;
}) {
  return (
    <Link
      href={href}
      className={`${controlBase} text-white`}
      style={{ backgroundColor: brand ?? '#4F46E5' }}
    >
      {children}
    </Link>
  );
}

export function Field({
  label,
  hint,
  required = false,
  hidden = false,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  /** For a field that does not apply to whoever is looking at the form. */
  hidden?: boolean;
  children: ReactNode;
}) {
  if (hidden) return null;

  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">{hint}</span>
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
  'focus-visible:outline-2 focus-visible:outline-offset-2 ' +
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
          <span className="block text-xs text-neutral-500 dark:text-neutral-400">{hint}</span>
        )}
      </span>
    </label>
  );
}

const STATUS_LABELS = {
  draft: 'Borrador',
  pending_review: 'Pendiente de revisión',
  published: 'Publicado',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
} as const;

const STATUS_CLASSES = {
  draft: 'bg-neutral-200 text-neutral-800',
  pending_review: 'bg-amber-200 text-amber-900',
  published: 'bg-emerald-200 text-emerald-900',
  rejected: 'bg-neutral-300 text-neutral-800',
  cancelled: 'bg-red-200 text-red-900',
} as const;

export function StatusBadge({ status }: { status: keyof typeof STATUS_LABELS }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_CLASSES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{hint}</p> : null}
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <Card>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{children}</p>
    </Card>
  );
}
