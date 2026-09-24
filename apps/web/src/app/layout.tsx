import { BRAND } from '@agora/core';
import type { Metadata } from 'next';
import { Archivo } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: `Panel municipal · ${BRAND.name}`,
  description: 'Agenda de eventos del municipio',
};

/**
 * The one typeface the panel loads, and only for the things that are looked at
 * rather than read: page titles, section headings and the figures.
 *
 * This file used to say no webfont was loaded on purpose, for first paint on old
 * devices and to avoid a network dependency at build time. Half of that still
 * holds and half never did. The build already runs `pnpm install
 * --frozen-lockfile`, so depending on the network at build time is not a new
 * category; and `next/font` downloads the file once and serves it from our own
 * origin, so nothing reaches a third party when a municipal officer opens the
 * panel. What does hold — first paint — is why body copy stays on the system
 * stack and why this is `display: 'swap'` with an explicit fallback: if the
 * font never arrives, the panel looks exactly like it did before.
 *
 * The reason to spend it at all is that Archivo is the app's own face and the
 * dossier's. The panel was the only one of the three pieces of HoyQ speaking a
 * different typographic language, and it is the piece that gets projected onto
 * a meeting-room wall in front of a councillor.
 */
const display = Archivo({
  subsets: ['latin'],
  weight: ['600', '700'],
  display: 'swap',
  variable: '--font-archivo',
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
});

/**
 * Root layout. The interface language is Spanish; English is added later
 * through @agora/i18n without changing the document structure.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`h-full antialiased ${display.variable}`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
