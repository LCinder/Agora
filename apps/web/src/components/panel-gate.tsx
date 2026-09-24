'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { usePanel } from '../lib/panel-store';
import { PanelNav } from './panel-nav';
import { SignIn } from './sign-in';
import { Empty } from './ui';

/**
 * What stands between the address bar and the panel.
 *
 * In the demo there is nothing to stand between: no accounts, no API, and the
 * whole point is that it opens straight into the calendar in front of a
 * councillor. With a real backend, the panel is what somebody the town hall
 * invited signs into, and the API checks their membership on every request
 * regardless of what this component decides (D-026).
 */
export function PanelGate({ children }: { children: ReactNode }) {
  const { demo, identity, loadError, loading, municipality } = usePanel();

  // Before the spinner, because a failure that leaves `loading` true would
  // otherwise never be seen. This is the screen that was missing the first time
  // the panel went up against an API that refused its origin.
  if (!demo && loadError !== null) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-16">
        <Empty>
          <span className="font-medium">No hemos podido cargar el panel.</span>
          <br />
          {loadError}
          <br />
          <button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
            className="mt-4 underline"
          >
            Reintentar
          </button>
        </Empty>
      </main>
    );
  }

  if (!demo && loading) {
    return <p className="p-8 text-sm text-neutral-600">Cargando…</p>;
  }

  if (!demo && identity === null) {
    return <SignIn />;
  }

  // Signed in and with no municipality: an account whose access was revoked, or
  // one invited and never granted a role. Saying so beats an empty calendar.
  if (!demo && municipality === null) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-16">
        <Empty>
          Tu cuenta no tiene acceso a ningún municipio. Pídele al ayuntamiento que te lo dé.
        </Empty>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <PanelNav />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">{children}</main>

      {/* The same three pages the app links to. A service sold to a public
          administration has to carry them where they can be found. */}
      <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-sm text-neutral-600 sm:px-6">
        <nav className="flex flex-wrap gap-4 border-t border-black/10 pt-4 dark:border-white/10">
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
      </footer>
    </div>
  );
}
