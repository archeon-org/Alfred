import { expect, test } from '@playwright/test';

import {
  accountTrigger,
  chooseAccountItem,
  isPreviewLoadingOn,
  togglePreviewLoading,
} from './support/account-menu';
import { defaultSeed, installWorkspaceApi } from './support/workspace-api';

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

const disabledFeatures = {
  agentRuntime: false,
  agUiStreaming: false,
  fileUploads: false,
  generativeUi: false,
  googleOAuth: false,
  mcpApps: false,
  outputStyles: false,
  knowledgeScope: false,
  conversationFeedback: false,
  runtimeMemory: false,
  skills: false,
  teams: false,
};

test.beforeEach(async ({ page }) => {
  await installWorkspaceApi(page);
  await page.route('**/api/auth/providers', async (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: { data: [], success: true },
      status: 200,
    }),
  );
  await page.route('**/api/features', async (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: { data: disabledFeatures, success: true },
      status: 200,
    }),
  );
});

test('redirects an anonymous visitor to the configured login screen', async ({ page }) => {
  await page.route('**/api/auth/refresh', async (route) =>
    route.fulfill({ body: '', status: 401 }),
  );
  await page.goto('/app');

  await expect(page).toHaveTitle('Alfred');
  await expect(page.getByRole('heading', { level: 1, name: 'Bienvenue sur Alfred' })).toBeVisible();
  await expect(page.getByText(/Aucun fournisseur de connexion n’est configuré/i)).toBeVisible();
});

test('renders the authenticated workspace without persisting its access token', async ({
  page,
}) => {
  await page.route('**/api/auth/refresh', async (route) =>
    route.fulfill({ contentType: 'application/json', json: authenticatedSession, status: 200 }),
  );

  await page.goto('/app');

  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nouvelle conversation' }),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
  await expect(page.getByText('Ada Lovelace')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => [localStorage.length, sessionStorage.length]))
    .toEqual([0, 0]);
});

test('keeps a refresh outage distinct from an anonymous session', async ({ page }) => {
  await page.route('**/api/auth/refresh', async (route) =>
    route.fulfill({ body: '', status: 503 }),
  );

  await page.goto('/app');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Session momentanément indisponible' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bienvenue sur Alfred' })).toHaveCount(0);
});

test('serializes refresh rotation across two tabs', async ({ context, page }) => {
  let activeRefreshes = 0;
  let maximumActiveRefreshes = 0;
  let refreshCalls = 0;
  await context.route('**/api/auth/refresh', async (route) => {
    refreshCalls += 1;
    activeRefreshes += 1;
    maximumActiveRefreshes = Math.max(maximumActiveRefreshes, activeRefreshes);
    await new Promise((resolve) => setTimeout(resolve, 75));
    activeRefreshes -= 1;
    await route.fulfill({
      contentType: 'application/json',
      json: authenticatedSession,
      status: 200,
    });
  });
  const secondPage = await context.newPage();
  await installWorkspaceApi(secondPage);

  await Promise.all([page.goto('/app'), secondPage.goto('/app')]);

  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
  await expect(secondPage.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
  expect(refreshCalls).toBe(2);
  expect(maximumActiveRefreshes).toBe(1);
});

test('waits for another tab refresh before confirming logout', async ({ context, page }) => {
  let activeRefreshes = 0;
  let logoutOverlappedRefresh = false;
  let releaseRefresh!: () => void;
  const refreshReleased = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let refreshCalls = 0;
  await context.route('**/api/auth/refresh', async (route) => {
    refreshCalls += 1;
    activeRefreshes += 1;
    if (refreshCalls > 1) await refreshReleased;
    await route.fulfill({
      contentType: 'application/json',
      json: authenticatedSession,
      status: 200,
    });
    activeRefreshes -= 1;
  });
  await context.route('**/api/auth/logout', async (route) => {
    logoutOverlappedRefresh = activeRefreshes > 0;
    await route.fulfill({ status: 204 });
  });
  await page.goto('/app');
  await expect(accountTrigger(page)).toBeVisible();
  const secondPage = await context.newPage();
  await installWorkspaceApi(secondPage);
  await secondPage.goto('/app');
  await expect.poll(() => activeRefreshes).toBe(1);

  await chooseAccountItem(page, 'Se déconnecter');
  releaseRefresh();
  await expect(page.getByRole('heading', { name: 'Bienvenue sur Alfred' })).toBeVisible();
  expect(logoutOverlappedRefresh).toBe(false);
  await expect
    .poll(() => page.evaluate(() => [localStorage.length, sessionStorage.length]))
    .toEqual([0, 0]);
});

test('moves keyboard focus to the main content after route navigation', async ({ page }) => {
  await page.route('**/api/auth/refresh', async (route) =>
    route.fulfill({ body: '', status: 401 }),
  );
  await page.goto('/route-inconnue');

  await expect(page.getByRole('main')).toBeFocused();
  await page.getByRole('link', { name: 'Retour à l’accueil' }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('main')).toBeFocused();
});

test('keeps every workspace panel reachable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.route('**/api/auth/refresh', async (route) =>
    route.fulfill({ contentType: 'application/json', json: authenticatedSession, status: 200 }),
  );

  await page.goto('/app');

  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Contexte de la conversation' }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate<number>('document.documentElement.scrollWidth'))
    .toBeLessThanOrEqual(390);
});

test('lets the context panel use the full tablet width', async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1024 });
  await page.route('**/api/auth/refresh', async (route) =>
    route.fulfill({ contentType: 'application/json', json: authenticatedSession, status: 200 }),
  );

  await page.goto('/app');

  const contextPanel = page.getByRole('complementary', { name: 'Contexte de la conversation' });
  await expect(contextPanel).toBeVisible();
  await expect
    .poll(async () => (await contextPanel.boundingBox())?.width ?? 0)
    .toBeGreaterThan(1000);
});

test('browses conversations by keyboard while keeping drafts local', async ({ page }) => {
  await page.route('**/api/auth/refresh', async (route) =>
    route.fulfill({ contentType: 'application/json', json: authenticatedSession, status: 200 }),
  );
  await page.goto('/app');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nouvelle conversation' }),
  ).toBeVisible();
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/') && request.method() !== 'GET')
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });

  const search = page.getByRole('searchbox', { name: 'Rechercher une conversation' });
  await search.fill('comité');
  const sample = page.getByRole('button', { name: 'Synthèse du comité projet', exact: true });
  await sample.focus();
  await page.keyboard.press('Enter');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Synthèse du comité projet' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/app\/conversations\//u);
  const composer = page.getByRole('textbox', { name: 'Message' });
  await composer.fill('Un brouillon privé');
  await composer.press('Enter');
  await expect(composer).toHaveValue('Un brouillon privé\n');
  await expect(page.getByRole('button', { name: /envoyer/i })).toBeDisabled();
  await expect(page.getByRole('button', { name: /joindre/i })).toBeDisabled();

  await page.getByRole('button', { name: 'Nouvelle conversation' }).click();
  // No dialog: an empty chat opens in the project of the current conversation.
  await expect(page.getByRole('heading', { level: 1, name: /^Nouveau chat/u })).toBeVisible();
  await expect(composer).toHaveValue('');
  await composer.fill('Nouveau brouillon');
  await composer.press('Enter');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Nouvelle conversation' }),
  ).toBeVisible();
  // Without the agent bridge the first message waits in the composer as a draft.
  await expect(composer).toHaveValue('Nouveau brouillon');
  expect(writes).toEqual(['POST /api/conversations']);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('opens mobile history and restores a hidden context without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.route('**/api/auth/refresh', async (route) =>
    route.fulfill({ contentType: 'application/json', json: authenticatedSession, status: 200 }),
  );
  await page.goto('/app');

  const historyToggle = page.getByRole('button', { name: 'Afficher les conversations' });
  await historyToggle.click();
  await expect(page.getByRole('button', { name: 'Masquer les conversations' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page
    .getByRole('searchbox', { name: 'Rechercher une conversation' })
    .fill('aucune-correspondance');
  await expect(page.getByText('Aucun chat libre trouvé')).toBeVisible();
  await page.getByRole('button', { name: 'Masquer les conversations' }).click();
  await expect(page.getByRole('searchbox', { name: 'Rechercher une conversation' })).toBeHidden();

  await historyToggle.click();
  await page.getByRole('searchbox', { name: 'Rechercher une conversation' }).fill('comité');
  const sample = page.getByRole('button', { name: 'Synthèse du comité projet', exact: true });
  await sample.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await expect(sample).toBeHidden();

  await page.getByRole('button', { name: 'Masquer le contexte' }).click();
  await expect(
    page.getByRole('complementary', { name: 'Contexte de la conversation' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Afficher le contexte' }).click();
  await expect(
    page.getByRole('complementary', { name: 'Contexte de la conversation' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('respects reduced motion while previewing loading placeholders', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/auth/refresh', async (route) =>
    route.fulfill({ contentType: 'application/json', json: authenticatedSession, status: 200 }),
  );
  await page.goto('/app');
  await togglePreviewLoading(page);
  const status = page.getByRole('status', { name: 'Chargement de l’espace de travail' });

  await expect(status).toBeVisible();
  expect(await isPreviewLoadingOn(page)).toBe(true);
  const skeletons = page.locator('[data-slot="skeleton"]');
  expect(await skeletons.count()).toBeGreaterThan(0);
  expect(
    await skeletons.evaluateAll((elements) =>
      elements.every((element) => getComputedStyle(element).animationName === 'none'),
    ),
  ).toBe(true);

  await togglePreviewLoading(page);
  await expect(status).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
});

test('creates a project, its first conversation and a separate standalone chat', async ({
  page,
}) => {
  await page.route('**/api/auth/refresh', async (route) =>
    route.fulfill({ contentType: 'application/json', json: authenticatedSession, status: 200 }),
  );
  await page.goto('/app');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nouvelle conversation' }),
  ).toBeVisible();
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/') && request.method() !== 'GET')
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  const createProject = page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('button', { name: 'Nouveau projet' });
  await createProject.click();
  const projectDialog = page.getByRole('dialog', { name: 'Nouveau projet' });
  await projectDialog.getByRole('textbox', { name: 'Nom du projet' }).fill('Projet annulé');
  await page.keyboard.press('Escape');
  await expect(projectDialog).toHaveCount(0);
  await expect(createProject).toBeFocused();
  await expect(page.getByRole('group', { name: 'Projet annulé' })).toHaveCount(0);
  expect(writes).toEqual([]);

  await createProject.click();
  await projectDialog.getByRole('textbox', { name: 'Nom du projet' }).fill('Projet Atlas');
  await projectDialog.getByRole('button', { name: 'Créer le projet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Projet Atlas' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Chats/u })).toBeVisible();
  await expect(
    page.getByRole('tablist', { name: 'Contenu du projet' }).getByRole('tab', { name: 'Contexte' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Nouvelle conversation', exact: true }).click();
  // No dialog: the first message creates the chat; the API names it once the message is sent.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nouveau chat dans Projet Atlas' }),
  ).toBeVisible();
  const composer = page.getByRole('textbox', { name: 'Message' });
  await composer.fill('Décisions de lancement');
  await composer.press('Enter');

  const project = page.getByRole('group', { name: 'Projet Atlas' });
  await expect(
    project.getByRole('button', { name: 'Nouvelle conversation', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nouvelle conversation' }),
  ).toBeVisible();
  await expect(composer).toHaveValue('Décisions de lancement');
  await page.getByRole('button', { name: 'Ouvrir un chat libre' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/app$/u);
  await composer.fill('Piste indépendante');
  await composer.press('Enter');
  await expect(
    page
      .getByRole('group', { name: 'Chats libres' })
      .getByRole('button', { name: 'Nouvelle conversation', exact: true }),
  ).toBeVisible();
  await expect(composer).toHaveValue('Piste indépendante');
  await expect(
    project.getByRole('button', { name: 'Piste indépendante', exact: true }),
  ).toHaveCount(0);
  await project.getByRole('button', { name: 'Projet Atlas', exact: true }).click();
  await project.getByRole('button', { name: 'Nouvelle conversation', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nouvelle conversation' }),
  ).toBeVisible();
  expect(writes).toEqual([
    'POST /api/projects',
    'POST /api/conversations',
    'POST /api/conversations',
  ]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('opens settings directly and preserves local display preferences across navigation', async ({
  page,
}) => {
  await page.route('**/api/auth/refresh', async (route) =>
    route.fulfill({ contentType: 'application/json', json: authenticatedSession, status: 200 }),
  );
  await page.goto('/app');
  await chooseAccountItem(page, 'Paramètres');
  const dialog = page.getByRole('main');
  await expect(page).toHaveURL(/\/app\/settings$/u);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Largeur de lecture' }).selectOption('wide');
  await dialog.getByRole('switch', { name: 'Navigation compacte' }).click();
  await dialog.getByRole('switch', { name: 'Réduire les animations' }).click();
  const workspace = page.locator('html');
  await expect(workspace).toHaveAttribute('data-density', 'compact');
  await expect(workspace).toHaveAttribute('data-reading-width', 'wide');
  await expect(workspace).toHaveAttribute('data-reduced-motion', 'true');
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
  await expect(workspace).toHaveAttribute('data-reading-width', 'wide');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([1, 0]);
});

test('resizes both desktop panels with keyboard and pointer while preserving the conversation space', async ({
  page,
}) => {
  await page.setViewportSize({ height: 1000, width: 1440 });
  await page.route('**/api/auth/refresh', async (route) =>
    route.fulfill({ contentType: 'application/json', json: authenticatedSession, status: 200 }),
  );
  await page.goto('/app');
  const navigation = page.getByRole('navigation', { name: 'Navigation principale' });
  const context = page.getByRole('complementary', { name: 'Contexte de la conversation' });
  const leftHandle = page.getByRole('separator', { name: 'Redimensionner la navigation' });
  const rightHandle = page.getByRole('separator', {
    name: 'Redimensionner le panneau de contexte',
  });
  await expect(leftHandle).toBeVisible();
  await expect(rightHandle).toBeVisible();
  await expect
    .poll(
      async () =>
        (await page.getByRole('complementary', { name: 'Espace personnel' }).boundingBox())
          ?.height ?? 0,
    )
    .toBeGreaterThanOrEqual(990);
  const initialNavigationWidth = (await navigation.boundingBox())?.width ?? 0;
  const initialContextWidth = (await context.boundingBox())?.width ?? 0;

  await leftHandle.focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await navigation.boundingBox())?.width ?? 0)
    .toBeGreaterThan(initialNavigationWidth);
  await rightHandle.focus();
  await page.keyboard.press('ArrowLeft');
  await expect
    .poll(async () => (await context.boundingBox())?.width ?? 0)
    .toBeGreaterThan(initialContextWidth);

  for (const [handle, delta] of [
    [leftHandle, 60],
    [rightHandle, -60],
  ] as const) {
    const before = await handle.boundingBox();
    expect(before).not.toBeNull();
    if (!before) throw new Error('Resize handle is not visible');
    const x = before.x + before.width / 2;
    const y = before.y + before.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + delta, y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await handle.boundingBox())?.x ?? 0).not.toBe(before.x);
  }

  expect((await page.getByRole('main').boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(380);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  await page.getByRole('button', { name: 'Masquer la navigation' }).click();
  await expect(navigation).toBeHidden();
  await expect(leftHandle).toHaveAttribute('aria-valuenow', '0');
  await page.getByRole('button', { name: 'Afficher la navigation' }).click();
  await expect(navigation).toBeVisible();
  await expect(leftHandle).toBeVisible();
});

test('recovers mobile navigation after collapsing the desktop sidebar', async ({ page }) => {
  await page.setViewportSize({ height: 1000, width: 1440 });
  await page.route('**/api/auth/refresh', async (route) =>
    route.fulfill({ contentType: 'application/json', json: authenticatedSession, status: 200 }),
  );
  await page.goto('/app');
  await page.getByRole('button', { name: 'Masquer la navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeHidden();

  await page.setViewportSize({ height: 844, width: 390 });
  await page.getByRole('button', { name: 'Afficher les conversations' }).click();

  await expect(page.getByRole('searchbox', { name: 'Rechercher une conversation' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Nouvelle conversation', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refonte du portail', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('renames, pins and deletes a conversation through accessible menus', async ({ page }) => {
  await page.route('**/api/auth/refresh', async (route) =>
    route.fulfill({ json: authenticatedSession, status: 200 }),
  );
  await page.goto('/app/projects/0b6e1a9e-0a7f-4c26-9f5b-2f1a2c3d4e5f');
  const chats = page.getByRole('list', { name: 'Chats du projet' });
  await chats
    .getByRole('button', { name: 'Actions de la conversation Synthèse du comité projet' })
    .click();
  await page.getByRole('menuitem', { name: 'Renommer la conversation' }).click();
  const rename = page.getByRole('dialog', { name: 'Renommer la conversation' });
  await rename
    .getByRole('textbox', { name: 'Titre de la conversation' })
    .fill('Décisions partagées');
  await rename.getByRole('button', { name: 'Renommer', exact: true }).click();
  await expect(rename).not.toBeVisible();
  await chats
    .getByRole('button', { name: 'Actions de la conversation Décisions partagées' })
    .click();
  await page.getByRole('menuitem', { name: 'Épingler la conversation', exact: true }).click();
  await chats
    .getByRole('button', { name: 'Actions de la conversation Décisions partagées' })
    .click();
  await expect(page.getByRole('menuitem', { name: 'Désépingler la conversation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await chats.getByRole('button', { name: /^Décisions partagées/u }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Décisions partagées' })).toBeVisible();
  await page
    .getByRole('button', { name: 'Actions de la conversation Décisions partagées' })
    .focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Supprimer la conversation' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Supprimer la conversation' })
    .click();
  await expect(page).toHaveURL(/\/app\/projects\//u);
  await expect(page.getByRole('list', { name: 'Chats du projet' })).not.toBeVisible();
});

test('drives the panels, a new chat and the shortcut settings from the keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/auth/refresh', async (route) =>
    route.fulfill({ contentType: 'application/json', json: authenticatedSession, status: 200 }),
  );
  await page.goto(`/app/conversations/${defaultSeed().conversations[0]!.id}`);
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
  const context = page.getByRole('complementary', { name: 'Contexte de la conversation' });
  const navigation = page.getByRole('complementary', { name: 'Espace personnel', exact: true });

  // Physical keys: the same gesture on AZERTY and QWERTY, none reserved by a browser.
  await page.keyboard.press('ControlOrMeta+Shift+Period');
  await expect(context).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+Period');
  await expect(context).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Shift+Comma');
  await expect(navigation).toBeHidden();
  await expect(page.getByRole('button', { name: 'Afficher la navigation' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Shift+Comma');
  await expect(navigation).toBeVisible();

  // The chord is safe while typing: nothing is inserted and the settings open on the shortcuts.
  const composer = page.getByRole('textbox', { name: 'Message' });
  await composer.fill('Brouillon');
  await composer.press('ControlOrMeta+Slash');
  await expect(page).toHaveURL(/\/app\/settings\?section=shortcuts$/u);
  await expect(page.getByRole('heading', { level: 1, name: 'Raccourcis clavier' })).toBeVisible();
  const rows = page.getByRole('list').filter({ hasText: 'Par défaut :' });
  await expect(rows.getByRole('button', { name: 'Modifier' })).toHaveCount(4);
  const contextRow = rows.getByRole('listitem').filter({ hasText: 'masquer le contexte' });
  await expect(contextRow.getByText(/^(⌘⇧|Ctrl\+Maj\+)\.$/u)).toBeVisible();

  // Rebinding: a reserved key is refused with the reason, a free key is recorded and applied.
  await contextRow.getByRole('button', { name: 'Modifier' }).click();
  await page.keyboard.press('ControlOrMeta+f');
  await expect(contextRow.getByRole('alert')).toContainText('rechercher dans la page');
  await page.keyboard.press('ControlOrMeta+Shift+Semicolon');
  await expect(contextRow.getByRole('alert')).toHaveCount(0);
  await expect(contextRow.getByText(/^(⌘⇧|Ctrl\+Maj\+)[:;]$/u)).toBeVisible();
  await page.goBack();
  await expect(composer).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Shift+Period');
  await expect(context).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Shift+Semicolon');
  await expect(context).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+Semicolon');
  await expect(context).toBeVisible();
  await expect(page.getByRole('button', { name: 'Masquer le contexte' })).toHaveAttribute(
    'aria-keyshortcuts',
    /Shift\+.$/u,
  );
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('alfred.shortcuts.v1')))
    .toContain('"toggleContext"');

  // The seed chat belongs to a project: the new chat opens inside that project.
  await page.keyboard.press('ControlOrMeta+Shift+Space');
  await expect(page).toHaveURL(/\/app\/conversations\/new\?projectId=/u);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nouveau chat dans Refonte du portail' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Masquer la navigation' })).toHaveAttribute(
    'aria-keyshortcuts',
    /Shift\+,$/u,
  );
});

test('moves a free chat into a project and restores menu focus when cancelling', async ({
  page,
}) => {
  const seed = defaultSeed();
  const implicitId = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
  const chat = {
    ...seed.conversations[0]!,
    projectId: implicitId,
    projectKind: 'implicit' as const,
  };
  await installWorkspaceApi(page, {
    conversations: [chat],
    projects: [
      ...seed.projects,
      { ...seed.projects[0]!, id: implicitId, kind: 'implicit', name: null },
    ],
  });
  await page.route('**/api/auth/refresh', async (route) =>
    route.fulfill({ json: authenticatedSession, status: 200 }),
  );
  await page.goto(`/app/conversations/${chat.id}`);
  const trigger = page.getByRole('button', { name: `Actions de la conversation ${chat.title}` });
  await trigger.click();
  await page.getByRole('menuitem', { name: 'Ajouter à un projet' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajouter la conversation à un projet' });
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Renommer la conversation' }).focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('dialog', { name: 'Renommer la conversation' })
    .getByRole('button', { name: 'Annuler' })
    .click();
  await expect(trigger).toBeFocused();
  await page.getByRole('textbox', { name: 'Message' }).fill('Mon brouillon');
  await trigger.click();
  await page.getByRole('menuitem', { name: 'Ajouter à un projet' }).click();
  await dialog.getByRole('radio', { name: 'Refonte du portail' }).check();
  await dialog.getByRole('button', { name: 'Ajouter au projet' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(`/app/conversations/${chat.id}`);
  await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('Mon brouillon');
  await expect(page.getByRole('main')).toBeFocused();
  // The chat now lives under its project: the sidebar row carries the scope.
  await expect(
    page.getByRole('button', { name: 'Refonte du portail', exact: true }),
  ).toHaveAttribute('aria-current', 'true');
  await trigger.click();
  await expect(page.getByRole('menuitem', { name: 'Ajouter à un projet' })).toHaveCount(0);
});
