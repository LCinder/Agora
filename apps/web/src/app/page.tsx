import { DEFAULT_TIME_ZONE } from '@agora/core';
import { DEFAULT_LOCALE } from '@agora/i18n';

/**
 * Placeholder landing page for the municipal panel.
 *
 * It exists to prove the workspace wiring end to end: the web app resolves and
 * compiles the shared packages. Replaced by the real panel in step 6.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">Panel municipal</h1>
      <p className="text-base text-gray-600 dark:text-gray-400">
        Andamiaje del monorepo listo. Las pantallas del panel llegan en el paso 6 del plan de
        Fase&nbsp;0.
      </p>
      <p className="text-sm text-gray-500">
        {DEFAULT_TIME_ZONE} &middot; {DEFAULT_LOCALE}
      </p>
    </main>
  );
}
