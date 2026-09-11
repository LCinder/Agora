import { groupEvents, residentVisibleEvents } from '@agora/core';
import { createSeedDataSource } from '@agora/data';

/**
 * Placeholder landing page for the municipal panel.
 *
 * It reads the seed through the data source, which proves the whole chain
 * works end to end. Replaced by the real panel in step 6.
 */
export default async function Home() {
  const source = createSeedDataSource();
  const municipality = await source.getMunicipalityBySlug('la-zubia');
  const events = residentVisibleEvents(await source.listEvents('la-zubia'));

  if (!municipality) {
    throw new Error('The demo municipality is missing from the seed');
  }

  const groups = groupEvents(events, { now: new Date(), timeZone: municipality.timeZone });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">{municipality.name}</h1>
      <p className="text-base text-gray-600 dark:text-gray-400">
        Andamiaje del monorepo listo. Las pantallas del panel llegan en el paso 6 del plan de
        Fase&nbsp;0.
      </p>
      <dl className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-gray-500">Hoy</dt>
          <dd className="text-2xl font-semibold">{groups.today.length}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Este finde</dt>
          <dd className="text-2xl font-semibold">{groups.thisWeekend.length}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Próximos</dt>
          <dd className="text-2xl font-semibold">{groups.upcoming.length}</dd>
        </div>
      </dl>
    </main>
  );
}
