'use client';

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
  const { demo, identity, loading, municipality } = usePanel();

  if (!demo && loading) {
    return <p className="p-8 text-sm text-neutral-500">Cargando…</p>;
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
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
