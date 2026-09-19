import type { ReactNode } from 'react';

import { PanelGate } from '../../components/panel-gate';
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
      <PanelGate>{children}</PanelGate>
    </PanelProvider>
  );
}
