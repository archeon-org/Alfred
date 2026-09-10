import { expect, test } from '@playwright/test';

import { defaultSeed, installWorkspaceApi } from './support/workspace-api';

const projectName =
  'Un projet au nom très long pour préparer toutes les prochaines étapes ensemble';
const chatName = 'Une conversation au titre très long qui doit rester lisible sur une seule ligne';

test.beforeEach(async ({ page }) => {
  const seed = defaultSeed();
  await installWorkspaceApi(page, {
    projects: seed.projects.map((project) => ({ ...project, name: projectName })),
    conversations: seed.conversations.map((conversation) => ({ ...conversation, title: chatName })),
  });
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          accessToken: 'layout-test-token',
          user: {
            id: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
            displayName: 'Ada Lovelace',
            email: 'ada@example.test',
            role: 'user',
          },
        },
      },
    }),
  );
});

for (const viewport of [
  { width: 1280, height: 650 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1440, height: 920 },
]) {
  test(`fits the initial chat without clipping or scrolling at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/app');
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
    await expect
      .poll(() =>
        page.locator('#conversation').evaluate((panel) => {
          const scroller = panel.querySelector('[data-slot="conversation-welcome"]')?.parentElement;
          return scroller ? scroller.scrollHeight - scroller.clientHeight : Infinity;
        }),
      )
      .toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      viewport.height,
    );
    await expect(page.getByRole('list', { name: 'Points de départ' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeInViewport({ ratio: 1 });
  });
}

test('keeps full accessible titles while ellipsizing and adapting to sidebar resizing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app');
  const project = page.getByRole('group', { name: projectName, exact: true });
  await project.getByRole('button', { name: projectName, exact: true }).click();
  const title = project.locator('span[title]').filter({ hasText: chatName });
  await expect(project.getByRole('button', { name: chatName, exact: true })).toBeVisible();
  const readTruncation = (element: HTMLElement | SVGElement) => ({
    overflow: getComputedStyle(element).textOverflow,
    whiteSpace: getComputedStyle(element).whiteSpace,
    clipped: element.scrollWidth > element.clientWidth,
    width: element.clientWidth,
  });
  for (const label of [project.locator('span[title]').filter({ hasText: projectName }), title]) {
    expect(await label.evaluate(readTruncation)).toMatchObject({
      overflow: 'ellipsis',
      whiteSpace: 'nowrap',
      clipped: true,
    });
  }
  const initial = (await title.evaluate(readTruncation)).width;
  const handle = page.getByRole('separator', { name: 'Redimensionner la navigation' });
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await title.evaluate(readTruncation)).width)
    .toBeGreaterThan(initial);
  await page.keyboard.press('ArrowLeft');
  await expect
    .poll(async () => (await title.evaluate(readTruncation)).width)
    .toBeLessThanOrEqual(initial);
  expect(await title.evaluate(readTruncation)).toMatchObject({
    overflow: 'ellipsis',
    whiteSpace: 'nowrap',
    clipped: true,
  });
});
