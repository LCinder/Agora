import { expect, test, type Page } from '@playwright/test';

/**
 * The panel in demo mode, which is the panel a councillor is shown.
 *
 * Each test starts from a clean browser, so the local storage the demo writes
 * does not leak from one to the next — the calendar a test edits must not be the
 * calendar the next one counts.
 */

/** Anything that never resolves leaves this on screen, which is the bug to catch. */
async function expectLoaded(page: Page): Promise<void> {
  await expect(page.getByText('Cargando…')).toHaveCount(0);
}

/**
 * What the browser complained about, per page.
 *
 * Asserted after every test rather than attached and forgotten: a screen that
 * throws while still rendering something looks fine in a screenshot, and this is
 * the only place that would notice.
 */
const problems = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const found: string[] = [];

  page.on('pageerror', (error) => found.push(`excepción: ${error.message}`));
  page.on('console', (message) => {
    // The dev server's hot reload socket is blocked in some environments and says
    // so loudly. It is not the application.
    if (message.type() === 'error' && !message.text().includes('WebSocket')) {
      found.push(message.text());
    }
  });

  problems.set(page, found);
});

test.afterEach(({ page }) => {
  expect(problems.get(page) ?? [], 'la pantalla ha dado errores en el navegador').toEqual([]);
});

test('every screen of the town hall opens with its own content', async ({ page }) => {
  const screens = [
    ['/', 'La Zubia'],
    ['/eventos', 'Eventos'],
    ['/revision', 'Revisión'],
    ['/directos', 'Directos'],
    ['/asociaciones', 'Asociaciones'],
    ['/datos', 'Datos'],
    ['/usuarios', 'Usuarios'],
    ['/eventos/nuevo', 'Nuevo evento'],
  ] as const;

  for (const [path, heading] of screens) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await expectLoaded(page);
  }
});

test('the calendar of the demo is loaded, not empty', async ({ page }) => {
  await page.goto('/');

  // The number comes from the seed, so the assertion is that there is one at all:
  // a panel that says zero published events is a panel that did not load.
  const published = page.getByText('Eventos publicados').locator('..');

  await expect(published).not.toContainText('0');
  await expect(page.getByRole('link', { name: 'Nuevo evento' })).toBeVisible();
});

test('approving an association event takes it out of the queue', async ({ page }) => {
  await page.goto('/revision');
  await expectLoaded(page);

  const pending = page.getByRole('button', { name: 'Aprobar' });
  const before = await pending.count();

  test.skip(before === 0, 'The seed has nothing waiting, so there is nothing to approve.');

  await pending.first().click();

  await expect(page.getByRole('button', { name: 'Aprobar' })).toHaveCount(before - 1);
});

test('a live session is armed, gets a code and starts', async ({ page }) => {
  await page.goto('/directos');
  await expectLoaded(page);

  await page.getByRole('button', { name: 'Preparar', exact: true }).first().click();

  // Eight characters from an alphabet without O, 0, I or 1: it is read out over
  // the telephone (D-043).
  const code = page.locator('.font-mono').first();

  await expect(code).toHaveText(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);

  await page.getByRole('button', { name: 'Empezar', exact: true }).first().click();

  await expect(page.getByText('Emitiendo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
});

test('the report downloads as a PDF', async ({ page }) => {
  await page.goto('/datos');
  await expectLoaded(page);

  const download = page.waitForEvent('download');

  await page.getByRole('button', { name: /Informe en PDF/ }).click();

  const file = await download;

  expect(file.suggestedFilename()).toMatch(/^informe-interes-la-zubia-\d{4}\.pdf$/);
});

test('an association can be created and trusted', async ({ page }) => {
  await page.goto('/asociaciones');
  await expectLoaded(page);

  const name = `Peña de prueba ${Date.now()}`;

  await page.getByLabel('Nombre').fill(name);
  await page.getByRole('button', { name: 'Dar de alta' }).click();

  const card = page.getByText(name).locator('../..');

  await expect(card).toBeVisible();

  // Trusting one is the lever that keeps the review queue short, so it is the
  // control worth checking actually holds.
  const trusted = card.getByRole('checkbox');

  await expect(trusted).not.toBeChecked();
  await trusted.check();
  await expect(trusted).toBeChecked();
});
