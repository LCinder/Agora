import { BRAND, COMPANY, companyIsPending } from '@agora/core';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * The shape of a legal page.
 *
 * Three of them — privacy, the legal notice and the accessibility statement —
 * and they are not panel screens: a neighbour opens them from the app's settings,
 * so they carry no navigation, no municipality colour and nothing to click but
 * the text.
 *
 * They are plain server components in the static export, which means they are
 * also the version that works with JavaScript turned off. For a page that a
 * public administration is required to serve, that matters more than it looks.
 */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-6">
      <p className="text-sm text-neutral-500">{BRAND.name}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        Última actualización: {COMPANY.updatedAt}
      </p>

      {companyIsPending() ? (
        <p
          role="note"
          className="mt-6 rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          Este texto está redactado y sin cerrar: falta poner los datos de la empresa y que lo
          revise alguien de derecho digital. Donde pone PENDIENTE va la razón social, el NIF, el
          domicilio y el correo de contacto.
        </p>
      ) : null}

      <div className="legal mt-8 space-y-4 text-[15px] leading-relaxed">{children}</div>

      <footer className="mt-12 border-t border-black/10 pt-6 text-sm dark:border-white/10">
        <nav className="flex flex-wrap gap-4">
          <Link href="/legal/privacidad" className="underline">
            Privacidad
          </Link>
          <Link href="/legal/aviso-legal" className="underline">
            Aviso legal
          </Link>
          <Link href="/legal/accesibilidad" className="underline">
            Accesibilidad
          </Link>
        </nav>
        <p className="mt-3 text-neutral-500">
          {COMPANY.legalName} · NIF {COMPANY.taxId} · {COMPANY.address} · {COMPANY.email}
        </p>
      </footer>
    </main>
  );
}

/** A heading inside a legal page, numbered the way these documents are read. */
export function Article({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

export function Rows({ rows }: { rows: { term: string; description: ReactNode }[] }) {
  return (
    <dl className="grid gap-3">
      {rows.map((row) => (
        <div key={row.term} className="grid gap-1 sm:grid-cols-[13rem_1fr] sm:gap-4">
          <dt className="font-medium">{row.term}</dt>
          <dd className="text-neutral-700 dark:text-neutral-300">{row.description}</dd>
        </div>
      ))}
    </dl>
  );
}
