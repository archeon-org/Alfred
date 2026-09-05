import { expect, test } from '@playwright/test';

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
  runtimeMemory: false,
  skills: false,
  teams: false,
};

test.beforeEach(async ({ page }) => {
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
