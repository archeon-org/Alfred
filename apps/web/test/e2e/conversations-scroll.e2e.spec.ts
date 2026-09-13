import { expect, test, type Locator, type Page } from '@playwright/test';

import { DISABLED_FEATURE_FLAGS } from '../../src/services/feature-flags/feature-flags';
import { defaultSeed, installWorkspaceApi, PROJECT_ID } from './support/workspace-api';

async function scrollToLastConversation(chats: Locator, index: number) {
  const row = chats.getByRole('listitem').nth(index);
  // Bottom alignment exposes the next-page boundary without centering a row and
  // leaving room for another page to intersect the mobile viewport in WebKit.
  await row.evaluate((element) => element.scrollIntoView({ block: 'end', behavior: 'instant' }));
  await expect(
    row.getByRole('button', { name: `Conversation ${index}`, exact: true }),
  ).toBeInViewport({ ratio: 1 });
}

async function prepare(page: Page, kind: 'implicit' | 'named') {
  const seed = defaultSeed();
  const conversations = Array.from({ length: 27 }, (_, index) => ({
    ...seed.conversations[0]!,
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    projectKind: kind,
    title: `Conversation ${index}`,
    createdAt: `2026-09-10T10:${String(59 - index).padStart(2, '0')}:00.000Z`,
  }));
  await installWorkspaceApi(page, { ...seed, conversations });
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          accessToken: 'e2e-memory-only-token',
          user: {
            id: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
            displayName: 'Ada',
            email: 'ada@example.test',
            role: 'user',
          },
        },
      },
    }),
  );
  await page.route('**/api/auth/providers', (route) =>
    route.fulfill({ json: { success: true, data: [] } }),
  );
  await page.route('**/api/features', (route) =>
    route.fulfill({ json: { success: true, data: DISABLED_FEATURE_FLAGS } }),
  );
}

test('scrolls standalone pages, shows skeletons and recovers a next-page error without losing rows', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 650 });
  await prepare(page, 'implicit');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let failed = false;
  const pages: string[] = [];
  await page.route('**/api/conversations?**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('projectKind') !== 'implicit') return route.fallback();
    expect(url.searchParams.get('limit')).toBe('10');
    pages.push(url.searchParams.get('cursor') ?? 'first');
    if (url.searchParams.get('cursor') === '10' && !failed) {
      await pending;
      failed = true;
      return route.fulfill({
        status: 503,
        json: { success: false, error: { code: 'HTTP_503', message: 'Unavailable' } },
      });
    }
    return route.fallback();
  });
  await page.goto('/app');
  const chats = page.getByRole('group', { name: 'Chats libres' });
  await expect(chats.getByRole('listitem')).toHaveCount(10);
  const history = page.locator('#conversation-history');
  await scrollToLastConversation(chats, 9);
  await expect(chats.getByRole('status', { name: 'Chargement des conversations' })).toBeVisible();
  await history.hover();
  await page.mouse.wheel(0, 1500);
  expect(pages.filter((cursor) => cursor === '10')).toHaveLength(1);
  release();
  await expect(chats.getByRole('alert')).toBeVisible();
  await expect(chats.getByRole('listitem')).toHaveCount(10);
  await chats.getByRole('button', { name: 'Réessayer le chargement des conversations' }).click();
  await expect(chats.getByRole('listitem')).toHaveCount(20);
  await scrollToLastConversation(chats, 19);
  await expect(chats.getByRole('listitem')).toHaveCount(27);
  await expect(chats.getByTestId('conversation-scroll-sentinel')).toHaveCount(0);
  expect(pages).toEqual(['first', '10', '10', '20']);
});

test('scrolls project chats and shares the loaded pages with its nested sidebar list', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 650 });
  await prepare(page, 'named');
  await page.goto(`/app/projects/${PROJECT_ID}`);
  const chats = page.getByRole('list', { name: 'Chats du projet' });
  await expect(chats.getByRole('listitem')).toHaveCount(10);
  await page.locator('#conversation').hover();
  await page.mouse.wheel(0, 1800);
  await expect(chats.getByRole('listitem')).toHaveCount(20);
  await page.mouse.wheel(0, 1800);
  await expect(chats.getByRole('listitem')).toHaveCount(27);
  await expect(
    page.getByRole('group', { name: 'Refonte du portail' }).getByRole('listitem'),
  ).toHaveCount(27);
  await expect(
    page.getByRole('button', { name: /Afficher plus de conversations|Charger plus de chats/u }),
  ).toHaveCount(0);
});

test('uses the mobile viewport so offscreen chat pages wait for scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await prepare(page, 'implicit');
  const pages: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/conversations')
      pages.push(url.searchParams.get('cursor') ?? 'first');
  });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Afficher les conversations' }).click();
  const chats = page.getByRole('group', { name: 'Chats libres' });
  await expect(chats.getByRole('listitem')).toHaveCount(10);
  // Two animation frames let pending layout/observer notifications settle without a fixed sleep.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(pages).toEqual(['first']);
  await expect(chats.getByTestId('conversation-scroll-sentinel')).not.toBeInViewport();
  await scrollToLastConversation(chats, 9);
  await expect(chats.getByRole('listitem')).toHaveCount(20);
  expect(pages).toEqual(['first', '10']);
  await scrollToLastConversation(chats, 19);
  await expect(chats.getByRole('listitem')).toHaveCount(27);
  expect(pages).toEqual(['first', '10', '20']);
});
