import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Accessibility, measured rather than declared.
 *
 * The declaration at `/legal/accesibilidad` says "partially conformant" and names
 * three gaps, because Real Decreto 1112/2018 asks a public administration for the
 * statement and not for perfection. What it does not do is prove anything: until
 * now nothing in this repository had ever checked a single contrast ratio.
 *
 * This runs axe over every screen, at the level the law points at — UNE-EN 301549,
 * which is WCAG 2.1 AA — and fails on anything it finds. It is not a substitute
 * for VoiceOver and TalkBack on a real phone, which is still owed and still in
 * the declaration as owed. It is the half a machine can do, and it is the half
 * that regresses silently.
 *
 * Nothing is excluded. The day something has to be, the exclusion belongs here
 * with the reason written next to it and the same line copied into the
 * declaration, because an exception a machine hides is an exception nobody
 * declared.
 */
const STANDARD = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function audit(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(STANDARD).analyze();

  // Printed rather than only counted: "2 violations" sends somebody back to the
  // browser, and the rule id and the selector are what they would go looking for.
  const found = result.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}\n      ${violation.nodes
        .map((node) => node.target.join(' '))
        .join('\n      ')}`,
  );

  expect(found, `${page.url()} fails WCAG 2.1 AA`).toEqual([]);
}

const SCREENS = [
  '/',
  '/eventos',
  '/eventos/nuevo',
  '/revision',
  '/directos',
  '/asociaciones',
  '/datos',
  '/usuarios',
  '/actividad',
  '/legal/privacidad',
  '/legal/aviso-legal',
  '/legal/accesibilidad',
] as const;

for (const screen of SCREENS) {
  test(`${screen} passes WCAG 2.1 AA`, async ({ page }) => {
    await page.goto(screen);

    // Auditing a spinner audits nothing, and every screen here loads its data
    // before it has anything to be accessible about.
    await expect(page.getByText('Cargando…')).toHaveCount(0);

    await audit(page);
  });
}

test('the panel is usable with the keyboard alone', async ({ page }) => {
  await page.goto('/');

  // Somebody who cannot use a mouse arrives at the first thing that takes focus.
  // If that is nothing, the whole panel is closed to them, and no contrast check
  // would ever have said so.
  await page.keyboard.press('Tab');

  const focused = await page.evaluate(() => {
    const active = document.activeElement;

    return active === null || active === document.body
      ? null
      : { tag: active.tagName, text: (active.textContent ?? '').trim().slice(0, 40) };
  });

  expect(focused, 'nothing takes focus on the first Tab').not.toBeNull();
});
