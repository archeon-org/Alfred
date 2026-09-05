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
  await expect(page.getByText(/Google OAuth est désactivé/i)).toBeVisible();
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
