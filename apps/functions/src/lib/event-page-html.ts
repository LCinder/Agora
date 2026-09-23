import {
  BRAND,
  type Activity,
  type Event,
  type Municipality,
  type Organization,
  activityDefaults,
  activityHasOwnLocation,
  activityPrice,
  formatLongDate,
  formatTime,
  groupActivitiesByDay,
  publicEventPath,
} from '@agora/core';

/**
 * The public page of an event, as a string of HTML.
 *
 * No framework and no build step: the whole page is one function, because what
 * it has to do is narrow — be readable, load instantly on a phone in a street
 * with bad coverage, and carry the Open Graph tags that turn a link pasted into
 * a WhatsApp group into a card with the title, the date and the town.
 *
 * That card is the product's growth loop rather than polish: the town hall
 * publishes once, a neighbour shares it, and whoever opens it is one tap from
 * installing. It is also why this is the one thing in the architecture that needs
 * a server at all.
 *
 * The styles are inline for the same reason: one request, nothing to cache, and
 * nothing to go missing.
 */
const escapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Everything written into the page goes through here.
 *
 * The text comes from a municipal officer typing into a form, not from a
 * stranger, but "our own users would not do that" is how injection bugs are
 * written, and a poster title with an ampersand in it is an ordinary Tuesday.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => escapes[character] ?? character);
}

export interface EventPageInput {
  municipality: Municipality;
  event: Event;
  organization: Organization | null;
  /** The programme, for an event that has one. Empty for almost every event. */
  activities?: readonly Activity[];
  /** Where this page is served from, for the canonical and Open Graph URLs. */
  siteUrl: string;
}

function when(event: Event, municipality: Municipality): string {
  const context = { now: new Date(), timeZone: municipality.timeZone, locale: 'es' as const };
  const day = formatLongDate(event.startAt, context);

  if (event.allDay) return day;

  const start = formatTime(event.startAt, context);
  const end = event.endAt === null ? null : formatTime(event.endAt, context);

  return end === null ? `${day} · ${start}` : `${day} · ${start} – ${end}`;
}

function mapUrl(event: Event): string | null {
  const { latitude, longitude } = event.location;

  if (latitude === null || longitude === null) return null;

  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
}

/**
 * The programme, printed the way a poster prints it: a heading per day and a
 * time down the left.
 *
 * Empty string for an event with no programme, which is most of them, so the
 * page gains nothing and loses nothing by asking.
 *
 * A cancelled line stays, struck through and labelled. Somebody opening this
 * link from a WhatsApp group on the Saturday morning is the exact person who
 * needs to read that the falconry show is off, and a line that quietly
 * disappeared would send them to the square anyway.
 */
function programme(event: Event, activities: readonly Activity[], timeZone: string): string {
  if (activities.length === 0) return '';

  const context = { now: new Date(), timeZone, locale: 'es' as const };
  const defaults = activityDefaults(event);

  const days = groupActivitiesByDay(activities, timeZone)
    .map((day) => {
      const lines = day.activities
        .map((activity) => {
          const cancelled = activity.status === 'cancelled';
          const price = activityPrice(activity, defaults);
          const where = activityHasOwnLocation(activity, defaults)
            ? ` · ${escapeHtml(activity.location?.name ?? '')}`
            : '';
          const cost = price.isFree || price.priceInfo === null
            ? ''
            : ` · ${escapeHtml(price.priceInfo)}`;

          const time = formatTime(activity.startAt, context);
          const ends = activity.endAt === null ? '' : `–${formatTime(activity.endAt, context)}`;

          return `<li${cancelled ? ' class="off"' : ''}>
            <span class="at">${escapeHtml(time)}${escapeHtml(ends)}</span>
            <span class="what">
              <strong>${escapeHtml(activity.title)}</strong>${cancelled ? ' <em>Cancelada</em>' : ''}${where}${cost}
              ${activity.description === '' ? '' : `<span class="note">${escapeHtml(activity.description)}</span>`}
            </span>
          </li>`;
        })
        .join('\n');

      return `<section class="day">
        <h3>${escapeHtml(formatLongDate(day.date, context))}</h3>
        <ul>${lines}</ul>
      </section>`;
    })
    .join('\n');

  return `<div class="programme"><h2>Programa</h2>${days}</div>`;
}

export function renderEventPage(input: EventPageInput): string {
  const { municipality, event, organization, siteUrl } = input;
  const activities = input.activities ?? [];

  const brand = municipality.branding.primaryColor;
  const schedule = when(event, municipality);
  const organiser = organization?.name ?? `Ayuntamiento de ${municipality.name}`;
  const price = event.isFree ? 'Entrada gratuita' : (event.priceInfo ?? 'Consultar');
  // Empty until the environment is told where it is served from, which cannot be
  // read off the distribution without Terraform chasing its own tail: the page is
  // one of that distribution's origins. An absolute URL is required by Open Graph,
  // so when there is none, the tag is left out rather than written wrong.
  const url =
    siteUrl === ''
      ? null
      : `${siteUrl.replace(/\/$/, '')}${publicEventPath(municipality.slug, event.id)}`;
  // The card a WhatsApp group sees. For something with a programme, how many
  // things are in it is the fact that makes somebody open the link.
  const description =
    activities.length === 0
      ? `${schedule} · ${event.location.name}`
      : `${schedule} · ${event.location.name} · ${activities.length} actividades`;
  const place = mapUrl(event);

  // The card people see before they decide whether to open the link. The image is
  // the poster when the event has one, and nothing when it does not: a broken
  // preview is worse than a plain one.
  const openGraph = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(BRAND.name)}" />`,
    `<meta property="og:locale" content="es_ES" />`,
    `<meta property="og:title" content="${escapeHtml(event.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    url === null ? null : `<meta property="og:url" content="${escapeHtml(url)}" />`,
    event.imageUrl === null
      ? `<meta name="twitter:card" content="summary" />`
      : [
          `<meta property="og:image" content="${escapeHtml(event.imageUrl)}" />`,
          `<meta name="twitter:card" content="summary_large_image" />`,
        ].join('\n    '),
  ]
    .filter((tag): tag is string => tag !== null)
    .join('\n    ');

  const cancelled =
    event.status === 'cancelled' ? `<p class="cancelled">Este evento se ha cancelado.</p>` : '';

  const detail = (label: string, value: string) =>
    `<div class="row"><dt>${label}</dt><dd>${value}</dd></div>`;

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(event.title)} · ${escapeHtml(municipality.name)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    ${url === null ? '' : `<link rel="canonical" href="${escapeHtml(url)}" />`}
    ${openGraph}
    <style>
      :root { color-scheme: light dark; --brand: ${escapeHtml(brand)}; --ink: #121211; --paper: #faf9f7; --muted: #6b6b66; }
      @media (prefers-color-scheme: dark) { :root { --ink: #f4f3f0; --paper: #121211; --muted: #9a9a94; } }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
      main { margin: 0 auto; max-width: 40rem; padding: 2rem 1rem 3rem; }
      .town { display: flex; align-items: center; gap: 0.6rem; color: var(--muted); font-size: 0.9rem; }
      .mark { width: 1.25rem; height: 1.25rem; border-radius: 0.3rem; background: var(--brand); }
      h1 { margin: 1rem 0 0; font-size: 1.9rem; line-height: 1.15; letter-spacing: -0.02em; }
      .cancelled { margin: 1.25rem 0 0; padding: 0.6rem 0.8rem; border-radius: 0.5rem; background: #fee2e2; color: #7f1d1d; font-weight: 600; }
      dl { margin: 1.75rem 0 0; display: grid; gap: 0.9rem; }
      .row { display: grid; gap: 0.15rem; }
      dt { color: var(--muted); font-size: 0.85rem; }
      dd { margin: 0; }
      a { color: inherit; }
      .poster { margin: 1.75rem 0 0; width: 100%; height: auto; border-radius: 0.75rem; }
      .description { margin: 1.75rem 0 0; white-space: pre-line; }
      .programme { margin: 2.25rem 0 0; }
      .programme h2 { margin: 0 0 0.25rem; font-size: 1.25rem; }
      .day { margin: 1.5rem 0 0; }
      .day h3 { margin: 0 0 0.5rem; font-size: 0.85rem; font-weight: 650; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
      .day ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 0.75rem; }
      .day li { display: grid; grid-template-columns: 5.5rem 1fr; gap: 0.5rem; align-items: baseline; }
      .at { color: var(--brand); font-variant-numeric: tabular-nums; font-weight: 650; font-size: 0.95rem; }
      .what { display: grid; gap: 0.15rem; }
      .note { color: var(--muted); font-size: 0.9rem; }
      .off { opacity: 0.6; }
      .off strong { text-decoration: line-through; }
      .off em { font-style: normal; font-weight: 650; color: #b91c1c; }
      @media (max-width: 26rem) { .day li { grid-template-columns: 1fr; gap: 0.1rem; } }
      .app { margin: 2.5rem 0 0; padding: 1.25rem; border-radius: 0.9rem; background: var(--brand); color: #fff; }
      .app p { margin: 0; }
      .app .lead { font-size: 1.05rem; font-weight: 650; }
      .app .small { margin-top: 0.35rem; font-size: 0.9rem; opacity: 0.92; }
      .app a { display: inline-block; margin-top: 1rem; color: #fff; font-weight: 650; }
      footer { margin: 2rem 0 0; color: var(--muted); font-size: 0.8rem; }
    </style>
  </head>
  <body>
    <main>
      <p class="town"><span class="mark" aria-hidden="true"></span>${escapeHtml(municipality.name)}</p>
      ${cancelled}
      <h1>${escapeHtml(event.title)}</h1>
      ${event.imageUrl === null ? '' : `<img class="poster" src="${escapeHtml(event.imageUrl)}" alt="Cartel de ${escapeHtml(event.title)}" />`}
      <dl>
        ${detail('Cuándo', escapeHtml(schedule))}
        ${detail(
          'Dónde',
          place === null
            ? escapeHtml(event.location.name)
            : `<a href="${escapeHtml(place)}" rel="noreferrer noopener" target="_blank">${escapeHtml(event.location.name)}</a>`,
        )}
        ${detail('Organiza', escapeHtml(organiser))}
        ${detail('Precio', escapeHtml(price))}
      </dl>
      ${event.description === '' ? '' : `<p class="description">${escapeHtml(event.description)}</p>`}
      ${programme(event, activities, municipality.timeZone)}
      <div class="app">
        <p class="lead">Toda la agenda de ${escapeHtml(municipality.name)} en el móvil</p>
        <p class="small">Recibe un recordatorio de lo que te interesa y entérate si algo cambia de hora o se cancela.</p>
        <a href="${escapeHtml(`${BRAND.scheme}://event/${event.id}`)}">Abrir en ${escapeHtml(BRAND.name)}</a>
      </div>
      <footer>
        ${escapeHtml(BRAND.name)} · ${escapeHtml(municipality.name)}
        ${
          siteUrl === ''
            ? ''
            : `· <a href="${escapeHtml(siteUrl.replace(/\/$/, ''))}/legal/privacidad">Privacidad</a>
        · <a href="${escapeHtml(siteUrl.replace(/\/$/, ''))}/legal/aviso-legal">Aviso legal</a>`
        }
      </footer>
    </main>
  </body>
</html>
`;
}

/** The page for a link that does not lead anywhere, which is also a shared link. */
export function renderNotFoundPage(): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Evento no encontrado · ${escapeHtml(BRAND.name)}</title>
    <meta name="robots" content="noindex" />
    <style>
      :root { color-scheme: light dark; --ink: #121211; --paper: #faf9f7; --muted: #6b6b66; }
      @media (prefers-color-scheme: dark) { :root { --ink: #f4f3f0; --paper: #121211; --muted: #9a9a94; } }
      body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.55 system-ui, sans-serif; }
      main { margin: 0 auto; max-width: 32rem; padding: 4rem 1.5rem; }
      h1 { font-size: 1.5rem; margin: 0 0 0.75rem; }
      p { color: var(--muted); margin: 0; }
    </style>
  </head>
  <body>
    <main>
      <h1>Este evento ya no está disponible</h1>
      <p>Puede que se haya retirado, o que el enlace esté incompleto. Pregunta en tu ayuntamiento o
      abre la agenda del municipio en la aplicación.</p>
    </main>
  </body>
</html>
`;
}
