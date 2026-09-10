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

test('persists the theme and accent, and follows OS changes only in system mode', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/app/settings');
  await expect(
    page.getByRole('complementary', { name: 'Contexte de la conversation' }),
  ).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Taille du texte' })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Sombre', exact: true }).check();
  await page.getByRole('radio', { name: 'Violet', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const darkBackground = await page
    .getByRole('main')
    .evaluate((el) => getComputedStyle(el.parentElement!).backgroundColor);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'violet');
  await page.getByRole('radio', { name: 'Clair', exact: true }).check();
  const lightBackground = await page
    .getByRole('main')
    .evaluate((el) => getComputedStyle(el.parentElement!).backgroundColor);
  expect(lightBackground).not.toBe(darkBackground);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: 'Système', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

for (const width of [390, 1440]) {
  test(`settings navigation and appearance stay usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/app/settings');
    await expect(page.getByRole('heading', { name: 'Apparence', exact: true })).toBeVisible();
    await page.getByRole('radio', { name: 'Sombre', exact: true }).check();
    await page.screenshot({
      path: `/tmp/alfred-settings-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('switch', { name: 'Ouvrir le contexte par défaut' }).click();
    await page.getByRole('link', { name: 'Personnaliser Alfred', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Modifier · Instructions générales' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Modifier · Instructions générales' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.getByRole('dialog').evaluate((el) => getComputedStyle(el).colorScheme)).toBe(
      'dark',
    );
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Retour à Alfred' }).click();
    await expect(
      page.getByRole('complementary', { name: 'Contexte de la conversation' }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole('complementary', { name: 'Contexte de la conversation' }),
    ).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

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
  await page.getByRole('link', { name: 'Paramètres' }).click();
  expect(await undersizedText()).toEqual([]);
});

test('supports keyboard activation and reduced-motion loading without decorative animation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app');
  const settings = page.getByRole('link', { name: 'Paramètres' });
  await settings.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('main');
  await expect(page).toHaveURL(/\/app\/settings$/u);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  const compact = dialog.getByRole('switch', { name: 'Navigation compacte' });
  await compact.focus();
  await page.keyboard.press('Space');
  await expect(compact).toBeChecked();
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();

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
  await page.getByRole('link', { name: 'Paramètres', exact: true }).click();
  await page.getByRole('switch', { name: 'Réduire les animations' }).click();
  await page.goBack();
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

test('synchronizes preferences between tabs and restores the default palette', async ({
  page,
  context,
}) => {
  await page.goto('/app/settings');
  const other = await context.newPage();
  await installWorkspaceApi(other);
  await other.route('**/api/auth/refresh', (route) =>
    route.fulfill({ json: authenticatedSession }),
  );
  await other.goto('/app/settings');
  await page.getByRole('radio', { name: 'Sombre', exact: true }).check();
  await page.getByRole('radio', { name: 'Bleu', exact: true }).check();
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(other.getByRole('radio', { name: 'Bleu', exact: true })).toBeChecked();
  await other.getByRole('button', { name: 'Restaurer l’apparence par défaut' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('radio', { name: 'Sauge', exact: true })).toBeChecked();
  await other.close();
});

test('changes actual navigation spacing and reading width while preserving panel controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto('/app');
  const newConversation = page.getByRole('button', { name: 'Nouvelle conversation', exact: true });
  const normalHeight = (await newConversation.boundingBox())!.height;
  await page.getByRole('button', { name: 'Masquer le contexte' }).click();
  const composer = page.getByRole('textbox', { name: 'Message' });
  const centeredWidth = (await composer.boundingBox())!.width;
  await page.getByRole('link', { name: 'Paramètres' }).click();
  await page.getByRole('switch', { name: 'Navigation compacte' }).click();
  await page.getByRole('combobox', { name: 'Largeur de lecture' }).selectOption('wide');
  await page.getByRole('link', { name: 'Retour à Alfred' }).click();
  expect((await newConversation.boundingBox())!.height).toBeLessThan(normalHeight);
  expect((await composer.boundingBox())!.width).toBeGreaterThan(centeredWidth);
  await expect(page.getByRole('button', { name: 'Afficher le contexte' })).toBeVisible();
});

test('keeps the same sidebar identity and accent surfaces when opening settings', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/app/settings');
  const navigationSurface = page.locator('#workspace-navigation');
  const sageColor = await navigationSurface.evaluate((el) => getComputedStyle(el).backgroundColor);
  const sageCanvas = await page
    .locator('html')
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--canvas'));
  await page.getByRole('radio', { name: 'Ambre', exact: true }).check();
  await expect
    .poll(() => navigationSurface.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe(sageColor);
  expect(
    await page.locator('html').evaluate((el) => getComputedStyle(el).getPropertyValue('--canvas')),
  ).not.toBe(sageCanvas);
  await page.getByRole('link', { name: 'Retour à Alfred' }).click();
  await expect(page.getByRole('separator', { name: 'Redimensionner la navigation' })).toBeVisible();
  const sidebar = page.getByRole('complementary', { name: 'Espace personnel', exact: true });
  const sidebarColor = await sidebar.evaluate((el) => getComputedStyle(el).backgroundColor);
  const width = (await sidebar.boundingBox())!.width;
  const brand = sidebar.getByRole('link', { name: 'alfred.' });
  const brandY = (await brand.boundingBox())!.y;
  const footer = sidebar.getByText('Alfred · Workspace');
  const footerY = (await footer.boundingBox())!.y;
  await page.screenshot({ path: '/tmp/alfred-workspace-amber.png', animations: 'disabled' });
  await page.getByRole('link', { name: 'Paramètres', exact: true }).click();
  await expect(sidebar).toBeVisible();
  await expect(brand).toBeVisible();
  await expect(footer).toBeVisible();
  expect((await sidebar.boundingBox())!.width).toBeCloseTo(width, 0);
  expect((await brand.boundingBox())!.y).toBeCloseTo(brandY, 0);
  expect((await footer.boundingBox())!.y).toBeCloseTo(footerY, 0);
  expect(await sidebar.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(sidebarColor);
  await page.screenshot({ path: '/tmp/alfred-settings-sidebar-amber.png', animations: 'disabled' });
  await expect(sidebar.getByRole('navigation', { name: 'Paramètres' })).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Contexte de la conversation' }),
  ).toHaveCount(0);
});

test('keeps dark surfaces charcoal and neutral for every accent', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/app/settings');
  await page.getByRole('radio', { name: 'Sombre', exact: true }).check();
  let initial: string[] | undefined;
  for (const name of ['Sauge', 'Bleu', 'Violet', 'Rose', 'Ambre']) {
    await page.getByRole('radio', { name, exact: true }).check();
    await page.getByRole('link', { name: 'Retour à Alfred' }).click();
    await expect(
      page.getByRole('separator', { name: 'Redimensionner la navigation' }),
    ).toBeVisible();
    const surfaces = await page.evaluate(() =>
      ['html', '#workspace-navigation', '#conversation'].map((selector) => {
        const element = document.querySelector(selector)!;
        return getComputedStyle(element).backgroundColor;
      }),
    );
    for (const surface of surfaces) {
      const channels = surface.match(/\d+/g)!.map(Number);
      expect(channels[0]).toBe(channels[1]);
      expect(channels[1]).toBe(channels[2]);
      expect(channels[0]).toBeGreaterThanOrEqual(24);
      expect(channels[0]).toBeLessThanOrEqual(48);
    }
    if (initial) expect(surfaces).toEqual(initial);
    initial = surfaces;
    if (name === 'Ambre')
      await page.screenshot({ path: '/tmp/alfred-neutral-dark.png', animations: 'disabled' });
    await page.getByRole('link', { name: 'Paramètres', exact: true }).click();
  }
});

test('aligns resize handles with the chat and preserves keyboard resizing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/app');
  const chat = page.locator('#conversation');
  for (const name of ['Redimensionner la navigation', 'Redimensionner le panneau de contexte']) {
    const handle = page.getByRole('separator', { name });
    await expect(handle).toBeVisible();
    const bounds = await handle.boundingBox();
    const chatBounds = await chat.boundingBox();
    expect(Math.abs(bounds!.y - chatBounds!.y)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(bounds!.y + bounds!.height - chatBounds!.y - chatBounds!.height),
    ).toBeLessThanOrEqual(1);
    const before = await handle.getAttribute('aria-valuenow');
    await handle.focus();
    await page.keyboard.press('ArrowRight');
    await expect(handle).not.toHaveAttribute('aria-valuenow', before!);
  }
});
