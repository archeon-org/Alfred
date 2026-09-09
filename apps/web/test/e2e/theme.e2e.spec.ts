import { expect, test } from '@playwright/test';

import { installWorkspaceApi } from './support/workspace-api';

const authenticatedSession = {
  data: {
    accessToken: 'e2e-memory-only-token',
    user: {
      displayName: 'Ada Lovelace',
      email: 'ada@example.test',
      id: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
      role: 'user',
    },
  },
  success: true,
};

test.beforeEach(async ({ page }) => {
  await installWorkspaceApi(page);
  await page.route('**/api/auth/refresh', async (route) =>
    route.fulfill({ contentType: 'application/json', json: authenticatedSession, status: 200 }),
  );
});

test('keeps a consistent light palette for the page and native controls when the OS switches to dark', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Paramètres' }).click();
  const select = page.getByRole('combobox', { name: 'Taille du texte' });
  const switchControl = page.getByRole('switch', { name: 'Navigation compacte' });
  const dialog = page.getByRole('dialog', { name: 'Paramètres' });
  const readColors = (element: HTMLElement | SVGElement) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      foreground: style.color,
      border: style.borderColor,
    };
  };
  const lightColors = await Promise.all([
    select.evaluate(readColors),
    switchControl.evaluate(readColors),
    dialog.evaluate(readColors),
  ]);

  await page.emulateMedia({ colorScheme: 'dark' });

  await expect
    .poll(async () =>
      Promise.all([
        select.evaluate(readColors),
        switchControl.evaluate(readColors),
        dialog.evaluate(readColors),
      ]),
    )
    .toEqual(lightColors);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
    'light',
  );
  await expect(select).toBeVisible();
  await expect(switchControl).toBeVisible();
});

test('keeps visible workspace and dialog text at least eleven CSS pixels', async ({ page }) => {
  await page.setViewportSize({ height: 1000, width: 1440 });
  await page.goto('/app');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nouvelle conversation' }),
  ).toBeVisible();
  const undersizedText = () =>
    page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const violations: { text: string; size: string }[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (
          !parent ||
          !node.textContent?.trim() ||
          parent.closest('svg,script,style,[hidden],[aria-hidden="true"],.sr-only')
        )
          continue;
        const box = parent.getBoundingClientRect();
        const style = getComputedStyle(parent);
        if (
          box.width <= 1 ||
          box.height <= 1 ||
          style.visibility !== 'visible' ||
          style.opacity === '0'
        )
          continue;
        if (Number.parseFloat(style.fontSize) < 11)
          violations.push({ text: node.textContent.trim().slice(0, 60), size: style.fontSize });
      }
      return violations;
    });
  expect(await undersizedText()).toEqual([]);
  await page.getByRole('button', { name: 'Refonte du portail', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Refonte du portail' })).toBeVisible();
  expect(await undersizedText()).toEqual([]);
  await page.getByRole('button', { name: 'Paramètres' }).click();
  expect(await undersizedText()).toEqual([]);
});

test('supports keyboard activation and reduced-motion loading without decorative animation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app');
  const settings = page.getByRole('button', { name: 'Paramètres' });
  await settings.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Paramètres' });
  await expect(dialog).toBeVisible();
  const compact = dialog.getByRole('switch', { name: 'Navigation compacte' });
  await compact.focus();
  await page.keyboard.press('Space');
  await expect(compact).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(settings).toBeFocused();

  const loading = page.getByRole('button', { name: 'Aperçu du chargement' });
  await loading.focus();
  await page.keyboard.press('Space');
  await expect(loading).toHaveAttribute('aria-pressed', 'true');
  const skeletons = page.locator('[data-slot="skeleton"]');
  expect(await skeletons.count()).toBeGreaterThan(0);
  expect(
    await skeletons.evaluateAll((elements) =>
      elements.every((element) => getComputedStyle(element).animationName === 'none'),
    ),
  ).toBe(true);
  await page.keyboard.press('Space');
  await expect(loading).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
});

test('gives buttons press feedback and removes movement with the application preference', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/app');
  const loading = page.getByRole('button', { name: 'Aperçu du chargement' });
  await loading.hover();
  await page.mouse.down();
  await expect
    .poll(() => loading.evaluate((element) => getComputedStyle(element).scale))
    .toBe('0.98');
  await page.mouse.up();
  await loading.click();
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
  await page.getByRole('switch', { name: 'Réduire les animations' }).click();
  await page.keyboard.press('Escape');
  await loading.hover();
  await page.mouse.down();
  await expect.poll(() => loading.evaluate((element) => getComputedStyle(element).scale)).toBe('1');
  await page.mouse.up();
  await expect(loading).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page
      .locator('[data-slot="skeleton"]')
      .evaluateAll((elements) =>
        elements.every((element) => getComputedStyle(element).animationName === 'none'),
      ),
  ).toBe(true);
});
