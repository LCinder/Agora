import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'Panel municipal',
  description: 'Agenda de eventos del municipio',
};

/**
 * Root layout. The interface language is Spanish; English is added later
 * through @agora/i18n without changing the document structure.
 *
 * No webfont is loaded on purpose: system fonts keep the first paint fast on
 * old devices and avoid a network dependency at build time.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
