'use client';

import { isAwaitingReview } from '@agora/core';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { usePanel } from '../lib/panel-store';

/**
 * Panel navigation.
 *
 * The review queue carries a count: an association's event sitting unapproved
 * is the one thing in this panel that goes stale if nobody looks at it.
 *
 * What is on the bar depends on the role, which comes from the membership table.
 * Not as a permission — the API checks that on every request and would refuse the
 * same things — but because offering somebody a button that answers 403 is worse
 * than not offering it. An association gets its own events and its own numbers;
 * the review queue, the associations and the live sessions are the town hall's,
 * and who has access is the administrator's.
 */
const LINKS = [
  { href: '/', label: 'Inicio', municipal: false, adminOnly: false },
  { href: '/eventos', label: 'Eventos', municipal: false, adminOnly: false },
  { href: '/revision', label: 'Revisión', municipal: true, adminOnly: false },
  { href: '/directos', label: 'Directos', municipal: true, adminOnly: false },
  { href: '/asociaciones', label: 'Asociaciones', municipal: true, adminOnly: false },
  { href: '/datos', label: 'Datos', municipal: false, adminOnly: false },
  { href: '/usuarios', label: 'Usuarios', municipal: true, adminOnly: true },
  { href: '/actividad', label: 'Actividad', municipal: true, adminOnly: true },
] as const;

export function PanelNav() {
  const {
    demo,
    events,
    identity,
    leave,
    memberships,
    municipality,
    municipalityNames,
    resetToSeed,
    role,
    switchMunicipality,
  } = usePanel();
  const pathname = usePathname();

  const municipal = role === 'municipal_editor' || role === 'municipal_admin';
  const links = LINKS.filter(
    (link) => (!link.municipal || municipal) && (!link.adminOnly || role === 'municipal_admin'),
  );

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

          {/* One town hall for almost everybody, so it is a name and not a
              control. It becomes one for a technician who works for two
              neighbouring towns, for a provincial officer, and for us. */}
          {memberships.length > 1 ? (
            <select
              aria-label="Cambiar de municipio"
              value={municipality?.id ?? ''}
              onChange={(event) => void switchMunicipality(event.target.value)}
              className="min-h-11 rounded-lg border border-black/15 bg-white px-2 font-semibold"
            >
              {memberships.map((entry) => (
                <option key={entry.municipalityId} value={entry.municipalityId}>
                  {municipalityNames[entry.municipalityId] ?? entry.municipalityId}
                </option>
              ))}
            </select>
          ) : (
            <span className="font-semibold">{municipality?.name ?? 'Panel municipal'}</span>
          )}
        </div>

        <nav aria-label="Secciones del panel" className="flex flex-wrap items-center gap-1">
          {links.map((link) => {
            const active = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  active
                    ? 'text-black dark:text-white'
                    : 'text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10'
                }`}
                /* El municipio se reconoce en su propio panel. Un 12 % de su
                   color es fondo suficiente para marcar dónde estás sin pelearse
                   con el contador de pendientes, que va a color pleno. */
                style={active ? { backgroundColor: `${brand}1F` } : undefined}
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
