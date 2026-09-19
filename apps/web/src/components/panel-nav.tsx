'use client';

import { isAwaitingReview } from '@agora/core';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { usePanel } from '../lib/panel-store';

const LINKS = [
  { href: '/', label: 'Inicio' },
  { href: '/eventos', label: 'Eventos' },
  { href: '/revision', label: 'Revisión' },
  { href: '/datos', label: 'Datos' },
] as const;

/**
 * Panel navigation.
 *
 * The review queue carries a count: an association's event sitting unapproved
 * is the one thing in this panel that goes stale if nobody looks at it.
 */
export function PanelNav() {
  const { demo, events, identity, leave, municipality, resetToSeed } = usePanel();
  const pathname = usePathname();

  const pending = events.filter(isAwaitingReview).length;
  const brand = municipality?.branding.primaryColor ?? '#4F46E5';

  return (
    <header className="border-b border-black/10 bg-white dark:border-white/10 dark:bg-neutral-900">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-block size-7 rounded"
            style={{ backgroundColor: brand }}
          />
          <span className="font-semibold">{municipality?.name ?? 'Panel municipal'}</span>
        </div>

        <nav aria-label="Secciones del panel" className="flex flex-wrap items-center gap-1">
          {LINKS.map((link) => {
            const active = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  active
                    ? 'bg-black/5 text-black dark:bg-white/10 dark:text-white'
                    : 'text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10'
                }`}
              >
                {link.label}
                {link.href === '/revision' && pending > 0 ? (
                  <span
                    className="ml-2 inline-flex min-w-5 justify-center rounded-full px-1.5 py-0.5 text-xs font-bold text-white"
                    style={{ backgroundColor: brand }}
                  >
                    {pending}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {demo ? (
          /*
            Resets the panel to the seed. Not a product feature: it is there so
            the same laptop can run the demo twice in an afternoon without
            carrying over whatever the previous councillor typed.
          */
          <button
            type="button"
            onClick={resetToSeed}
            className="ml-auto text-xs text-neutral-500 underline hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Reiniciar demo
          </button>
        ) : (
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-neutral-500 sm:inline">{identity?.email}</span>
            <button
              type="button"
              onClick={leave}
              className="text-xs text-neutral-500 underline hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              Salir
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
