import type { ReactNode } from 'react';

import { PanelNav } from '../../components/panel-nav';
import { PanelProvider } from '../../lib/panel-store';

/**
 * Layout for the municipal panel.
 *
 * The public event page lives outside this group: it is what a neighbour
 * opens from a WhatsApp link and must carry none of the panel chrome.
 */
export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <PanelProvider>
      <div className="flex min-h-screen flex-col">
        <PanelNav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      </div>
    </PanelProvider>
  );
}
