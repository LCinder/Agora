import { expect, test, type Page } from '@playwright/test';

/**
 * What a neighbour does with the app.
 *
 * Deliberately four paths and not a screen-by-screen tour: choose a town, read
 * the calendar, mark an event and find it again, and arrive from a shared link.
 * If any of those is broken the app is useless, and everything else is a detail
 * that a broken one of these makes irrelevant.
 *
 * The app renders here as React Native for web, so a passing test means the
 * screen renders and the state flows. It says nothing about a screen reader, the
 * push permission dialog, or the map on an old Android: those need a phone and
 * are still owed.
 *
 * Two things learned writing this, both worth keeping:
 *
 * Selectors are roles, not text layout. The design upper-cases its headings and
 * floats the tab bar over the content; a test that depended on either would break
 * on the next visual change with nothing actually wrong.
 *
 * And every wait is a positive assertion about what should be on screen. There is
 * no "no spinner showing" helper here, because `goto` returns before this app has
 * hydrated and a blank page has no spinner either — a check like that passes on
 * an app that never started, which is the failure it was meant to catch.
 */

/** What the browser complained about, per page. Asserted after every test. */
const problems = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  // Nothing outside the app is reachable, which is the condition this app was
  // designed for: a street full of people during a procession. The calendar is
  // bundled, so everything a resident reads must still be there — and the map,
  // whose tiles come from a third-party CDN, must fail without taking the screen
  // with it.
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());

  const found: string[] = [];

  page.on('pageerror', (error) => found.push(`excepción: ${error.message}`));
  page.on('console', (message) => {
    const text = message.text();

    // React Native for web warns from inside the library about props this app
    // never sets, and MapLibre complains when it cannot reach its basemap — which
    // is the blocked network above, and the same thing a resident with no coverage
    // gets. Neither is the application.
    const fromTheLibrary =
      text.includes('pointerEvents') ||
      text.includes('shadow') ||
      text.includes('useNativeDriver') ||
      text.includes('WebSocket') ||
      text.includes('basemaps.cartocdn.com') ||
      text.includes('Failed to load resource');

    if (message.type() === 'error' && !fromTheLibrary) found.push(text);
  });

  problems.set(page, found);
});

test.afterEach(({ page }) => {
  expect(problems.get(page) ?? [], 'la pantalla ha dado errores en el navegador').toEqual([]);
});

/**
 * One event card.
 *
 * A card's accessible name is "title. when. place" (see event-card.tsx), and the
 * filter chips beside them are single words, so the full stop is what tells a card
 * from a chip without naming a single seed event.
 */
function cards(page: Page) {
  return page.getByRole('button', { name: /\. / });
}

/**
 * One of the chips above the calendar: a view or a filter.
 *
 * By role and whole name, not by text: "Gratis" is also printed on every free
 * event's card, so looking for the words alone finds the chip and a poster.
 */
function chip(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

/** Gets past the municipality picker, which every other screen is behind. */
async function chooseMunicipality(page: Page, name = 'La Zubia'): Promise<void> {
  await page.goto('/');

  // A fresh browser has nothing stored, so the picker is what renders — once the
  // app has hydrated, which is after `goto` has already returned.
  await expect(page.getByText(/qué pueblo quieres ver la agenda/i)).toBeVisible();
  await page.getByText(name, { exact: true }).first().click();

  await expect(page.getByRole('tab', { name: 'Agenda' })).toBeVisible();
}

test('a resident chooses their town and sees its calendar', async ({ page }) => {
  await page.goto('/');

  // No account and no registration: the first thing the app asks is which town,
  // and that is the whole of the onboarding (D-029).
  await expect(page.getByText(/qué pueblo quieres ver la agenda/i)).toBeVisible();

  await page.getByText('La Zubia', { exact: true }).first().click();

  await expect(page.getByText(/^la zubia$/i)).toBeVisible();

  // The seed anchors its calendar around today, so the town's own events are
  // there. A screen with no cards is a calendar that did not load, which is the
  // failure a screenshot would not have shown.
  expect(await cards(page).count()).toBeGreaterThan(0);
});

test('the month view and the free filter both survive being used', async ({ page }) => {
  await chooseMunicipality(page);

  // Not a count: the list renders as it scrolls, so how many cards exist depends
  // on when you look. What matters is that each toggle leaves a calendar with
  // events in it — a filter that empties it for ever is the failure here.
  await expect(cards(page).first()).toBeVisible();

  await chip(page, 'Mes').click();
  await chip(page, 'Lista').click();
  await expect(cards(page).first()).toBeVisible();

  await chip(page, 'Gratis').click();
  await expect(cards(page).first()).toBeVisible();

  await chip(page, 'Todo').click();
  await expect(cards(page).first()).toBeVisible();
});

test('marking an event puts it in Mis eventos, and it survives a reload', async ({ page }) => {
  await chooseMunicipality(page);

  await page.getByRole('tab', { name: 'Mis eventos' }).click();
  await expect(page.getByText('Todavía no has dicho que vayas a ir a nada.')).toBeVisible();

  await page.getByRole('tab', { name: 'Agenda' }).click();

  const first = cards(page).first();

  await expect(first).toBeVisible();

  const title = ((await first.getAttribute('aria-label')) ?? '').split('. ')[0] ?? '';

  expect(title).not.toBe('');

  await first.click();
  await page.getByText('Asistiré', { exact: true }).click();

  // The event detail is its own screen with no tab bar, so getting back is the
  // back gesture, which is what a resident does too.
  await page.goBack();
  await page.getByRole('tab', { name: 'Mis eventos' }).click();

  await expect(page.getByText(title, { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Todavía no has dicho que vayas a ir a nada.')).toHaveCount(0);

  // Kept on the phone, not in memory: a mark that does not survive closing the
  // app is a reminder that never arrives (D-029).
  await page.reload();

  await expect(page.getByText(title, { exact: false }).first()).toBeVisible();
});

test('a shared link for a town the app does not know says so instead of hanging', async ({
  page,
}) => {
  await page.goto('/e/un-pueblo-que-no-existe/evt-lo-que-sea');

  // The link that spreads through a town reaches people whose town is not in this
  // build. That is not an error worth a dialog, and certainly not a spinner.
  await expect(page.getByText('Ese municipio todavía no está en la aplicación')).toBeVisible();
});

test('settings offers the three legal pages and the way to delete everything', async ({ page }) => {
  await chooseMunicipality(page);

  await page.getByRole('tab', { name: 'Ajustes' }).click();

  for (const label of ['Privacidad', 'Aviso legal', 'Accesibilidad']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }

  // The one thing article 17 can actually deliver for an anonymous device, so it
  // has to be reachable (D-058).
  await expect(page.getByText('Borrar mis datos', { exact: true })).toBeVisible();
});

test('a phone set to English gets the app in English', async ({ browser }) => {
  // Not a nicety: the interface is built for two languages from the start, and
  // the only thing that proves the second one is wired to the device is a device
  // asking for it. Every other test here runs in Spanish.
  const context = await browser.newContext({ locale: 'en-GB' });
  const page = await context.newPage();

  await page.goto('/');

  await expect(page.getByText(/which town do you want to follow/i)).toBeVisible();

  await context.close();
});
