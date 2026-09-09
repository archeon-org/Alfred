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
  const logoutButton = page.getByRole('button', { name: 'Se déconnecter' });
  await expect(logoutButton).toBeVisible();
  const secondPage = await context.newPage();
  await secondPage.goto('/app');
  await expect.poll(() => activeRefreshes).toBe(1);

  await logoutButton.click();
  await expect(logoutButton).toBeDisabled();
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
  const sample = page.getByRole('button', { name: 'Synthèse du comité projet' });
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
  await page.getByRole('textbox', { name: 'Titre de la conversation' }).fill('Nouveau brouillon');
  await page.getByRole('button', { name: 'Créer la conversation' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Nouveau brouillon' })).toBeVisible();
  await expect(composer).toHaveValue('');
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
  await expect(page.getByText('Aucune conversation trouvée')).toBeVisible();
  await page.getByRole('button', { name: 'Masquer les conversations' }).click();
  await expect(page.getByRole('searchbox', { name: 'Rechercher une conversation' })).toBeHidden();

  await historyToggle.click();
  await page.getByRole('searchbox', { name: 'Rechercher une conversation' }).fill('comité');
  const sample = page.getByRole('button', { name: 'Synthèse du comité projet' });
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
  const loadingToggle = page.getByRole('button', { name: 'Aperçu du chargement' });
  await loadingToggle.click();
  const status = page.getByRole('status', { name: 'Chargement de l’espace de travail' });

  await expect(status).toBeVisible();
  await expect(loadingToggle).toHaveAttribute('aria-pressed', 'true');
  const skeletons = page.locator('[data-slot="skeleton"]');
  expect(await skeletons.count()).toBeGreaterThan(0);
  expect(
    await skeletons.evaluateAll((elements) =>
      elements.every((element) => getComputedStyle(element).animationName === 'none'),
    ),
  ).toBe(true);

  await loadingToggle.click();
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
  const createProject = page.getByRole('button', { name: 'Créer un projet' });
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
  await expect(page.getByRole('tab', { name: 'Sources' })).toBeVisible();
  await page.getByRole('button', { name: 'Nouvelle conversation', exact: true }).click();
  const conversationDialog = page.getByRole('dialog', { name: 'Nouvelle conversation' });
  await expect(conversationDialog).toContainText('Projet Atlas');
  await conversationDialog
    .getByRole('textbox', { name: 'Titre de la conversation' })
    .fill('Décisions de lancement');
  await conversationDialog.getByRole('button', { name: 'Créer la conversation' }).click();

  const project = page.getByRole('group', { name: 'Projet Atlas' });
  await expect(
    project.getByRole('button', { name: 'Décisions de lancement', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Décisions de lancement' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Ouvrir un chat libre' }).click();
  const standaloneDialog = page.getByRole('dialog', { name: 'Nouveau chat libre' });
  await standaloneDialog.getByRole('textbox', { name: 'Titre du chat' }).fill('Piste indépendante');
  await standaloneDialog.getByRole('button', { name: 'Ouvrir le chat' }).click();
  await expect(
    page
      .getByRole('group', { name: 'Chats libres' })
      .getByRole('button', { name: 'Piste indépendante', exact: true }),
  ).toBeVisible();
  await expect(
    project.getByRole('button', { name: 'Piste indépendante', exact: true }),
  ).toHaveCount(0);
  await project.getByRole('button', { name: 'Projet Atlas', exact: true }).click();
  await project.getByRole('button', { name: 'Décisions de lancement', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Décisions de lancement' }),
  ).toBeVisible();
  expect(writes).toEqual([
    'POST /api/projects',
    'POST /api/conversations',
    'POST /api/conversations',
  ]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('applies local display preferences and restores focus when settings close', async ({
  page,
}) => {
  await page.route('**/api/auth/refresh', async (route) =>
    route.fulfill({ contentType: 'application/json', json: authenticatedSession, status: 200 }),
  );
  await page.goto('/app');
  const settings = page.getByRole('button', { name: 'Paramètres' });
  await settings.click();
  const dialog = page.getByRole('dialog', { name: 'Paramètres' });
  await dialog.getByRole('combobox', { name: 'Taille du texte' }).selectOption('comfortable');
  await dialog.getByRole('switch', { name: 'Navigation compacte' }).click();
  await dialog.getByRole('switch', { name: 'Réduire les animations' }).click();
  const workspace = page.locator('[data-density]');
  await expect(workspace).toHaveAttribute('data-density', 'compact');
  await expect(workspace).toHaveAttribute('data-text-size', 'comfortable');
  await expect(workspace).toHaveAttribute('data-reduced-motion', 'true');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeFocused();
  await expect(workspace).toHaveAttribute('data-text-size', 'comfortable');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
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
