import { expect, test } from '@playwright/test';

/**
 * The app built for a pilot, with nothing at the other end.
 *
 * This is the half the rest of the suite never touched. The demo build carries
 * the calendar inside it and makes no request, so it can never fail one — and
 * every test passed while the build that goes on a phone sat on «Cargando…» for
 * ever, because the first load threw and nobody caught it (D-068).
 *
 * What is asserted here is not that the app works without an API. It cannot: the
 * calendar lives there. It is that the app **finishes trying**, says so, and
 * offers a way out.
 */
test('the app does not hang when the API is not there', async ({ page }) => {
  await page.goto('/');

  // A positive assertion, and the reason is the mistake this file was written to
  // catch: «no spinner on screen» also passes on a blank page, and a blank page is
  // precisely what an unhandled rejection during the first load leaves behind. So
  // what is asserted is that something a resident can act on arrives — the picker
  // if anything loaded, the offline card if nothing did.
  //
  // Ten seconds is far longer than the client's own timeout.
  // `.first()` because when this passes both are on screen: the picker's heading
  // above and the offline card where its list would be.
  await expect(
    page.getByText(/qué pueblo quieres ver la agenda|no hemos podido conectar/i).first(),
  ).toBeVisible({ timeout: 10_000 });

  await expect(page.getByText('Cargando…')).toHaveCount(0);
});

test('it says the connection failed, rather than that the town does not exist', async ({
  page,
}) => {
  await page.goto('/');

  // The wrong message here is the one that loses a resident: telling somebody
  // their town is not on the platform when the truth is that there is no signal.
  await expect(page.getByText(/no hemos podido conectar/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/tu municipio todavía no está/i)).toHaveCount(0);

  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
});

test('the retry button tries again, and fails again without hanging', async ({ page }) => {
  await page.goto('/');

  const retry = page.getByRole('button', { name: 'Reintentar' });

  await expect(retry).toBeVisible({ timeout: 10_000 });
  await retry.click();

  // The API is still not there, so the same screen is the right answer. What
  // must not happen is the spinner coming back and staying.
  await expect(retry).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Cargando…')).toHaveCount(0);
});
