import { expect, test, type Page } from '@playwright/test';

import { installLongConversation, LONG_CONVERSATION_PATH } from './support/long-conversation';
import { defaultSeed, installWorkspaceApi } from './support/workspace-api';
import {
  enableSkills,
  expectStillDocument,
  installDiagramConversation,
  installProjectChats,
  logBrowserErrors,
  sampleDocumentScroll,
  SHEET_VIEWPORTS,
} from './support/workspace-shell';

const projectName =
  'Un projet au nom très long pour préparer toutes les prochaines étapes ensemble';
const chatName = 'Une conversation au titre très long qui doit rester lisible sur une seule ligne';

// Browser errors are printed with the test title so every run reports them.
test.beforeEach(({ page }, testInfo) => logBrowserErrors(page, testInfo.title));

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

for (const width of [390, 1440]) {
  test(`shows personal organisation and team at width ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/users/me/workspaces', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            tenant: { id: '11111111-1111-4111-8111-111111111111', name: 'Organisation de test' },
            workspaces: Array.from({ length: 8 }, (_, index) => ({
              id: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
              name:
                index === 0
                  ? 'Équipe produit'
                  : index === 1
                    ? 'Équipe recherche'
                    : `Équipe ${index + 1}`,
            })),
          },
        },
      }),
    );
    await page.goto('/app');
    if (width < 768) await page.getByRole('button', { name: 'Afficher les conversations' }).click();
    const sidebar = page.getByRole('complementary', { name: 'Espace personnel' });
    await expect(sidebar.getByText('Organisation de test')).toBeVisible();
    await expect(sidebar.getByText('Équipe produit')).toBeVisible();
    await expect(sidebar.getByText('Équipe recherche')).toBeVisible();
    const moreTeams = sidebar.getByText('5 autres équipes');
    await expect(sidebar.getByText('Équipe 8')).toBeHidden();
    await moreTeams.focus();
    await page.keyboard.press('Enter');
    await expect(sidebar.getByText('Équipe 8')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}

const shellViewports = [
  { width: 2000, height: 1093 },
  { width: 1440, height: 900 },
  ...SHEET_VIEWPORTS,
] as const;

/** Below md only the one-line bar sits above the chat. */
const NARROW_BAR_BOTTOM = 49;

async function openLongConversation(page: Page) {
  const { lastAnswer } = await installLongConversation(page);
  await page.goto(LONG_CONVERSATION_PATH);
  await expect(page.getByText(lastAnswer)).toBeAttached();
}

for (const viewport of shellViewports) {
  test(`keeps the document still around a long conversation at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openLongConversation(page);
    await expectStillDocument(page);

    // The conversation is a height-bounded cell: it ends inside the viewport at every width.
    const main = page.locator('#main-content');
    await expect
      .poll(async () => {
        const box = await main.boundingBox();
        return box === null ? Number.POSITIVE_INFINITY : box.y + box.height;
      })
      .toBeLessThanOrEqual(viewport.height + 1);
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeInViewport({ ratio: 1 });
    if (viewport.width < 768) expect((await main.boundingBox())!.y).toBeLessThan(NARROW_BAR_BOTTOM);

    // Nested scrollers back at their top leave the hidden labels of the last turns far below the
    // fold; neither they nor a programmatic scroll, a wheel or the keyboard may move the document.
    await page.evaluate(() => {
      for (const element of document.querySelectorAll<HTMLElement>('[data-workspace-shell] *'))
        if (element.scrollHeight > element.clientHeight) element.scrollTop = 0;
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await expectStillDocument(page);
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.wheel(0, 20_000);
    await page.keyboard.press('End');
    await expectStillDocument(page);
    // Nor may a wheel over the page scroll a resizable panel's own box, which pushed the chat
    // out of view and left an empty band under it.
    await page.mouse.move(viewport.width / 2, viewport.height - 10);
    await page.mouse.wheel(0, 20_000);
    await expect
      .poll(() =>
        page.evaluate(() =>
          Math.max(
            0,
            ...[...document.querySelectorAll<HTMLElement>('[data-panel] > div')].map(
              (box) => box.scrollTop,
            ),
          ),
        ),
      )
      .toBe(0);

    const docked = page.getByRole('separator', { name: 'Redimensionner le panneau de contexte' });
    const context = page.getByRole('complementary', { name: 'Contexte de la conversation' });
    if (viewport.width >= 1200) {
      await expect(docked).toBeVisible();
      await expect(context).toBeVisible();
    } else {
      // Below the workspace breakpoint the context is not in the page until it is asked for.
      await expect(docked).toHaveCount(0);
      await expect(context).toHaveCount(0);
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

// Phones held sideways and short browser windows: the bar alone sits above the chat.
for (const viewport of [
  { width: 667, height: 375 },
  { width: 390, height: 664 },
  { width: 320, height: 568 },
]) {
  test(`gives a short phone screen to the chat and its composer at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openLongConversation(page);
    const main = page.locator('#main-content');
    const box = (await main.boundingBox())!;
    expect(box.y).toBeLessThan(NARROW_BAR_BOTTOM);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Envoyer le message' })).toBeInViewport({
      ratio: 1,
    });
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeHidden();
    await expectStillDocument(page);
  });
}

// A viewport shorter than the layout's floor scrolls the shell, never the document.
for (const [viewport, floor] of [
  [{ width: 1280, height: 420 }, 480],
  [{ width: 1024, height: 300 }, 320],
  [{ width: 700, height: 300 }, 320],
] as const) {
  test(`scrolls the shell, not the document, below the layout floor at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openLongConversation(page);
    await page.evaluate(() => window.scrollTo(0, 10_000));
    await expectStillDocument(page);
    const shell = page.locator('[data-workspace-shell]');
    const reach = await shell.evaluate((element) => {
      element.scrollTop = 10_000;
      return { overflow: element.scrollHeight - element.clientHeight, top: element.scrollTop };
    });
    expect(reach.overflow).toBeCloseTo(floor - viewport.height, 0);
    expect(reach.top).toBeCloseTo(floor - viewport.height, 0);
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeInViewport({ ratio: 1 });
    await expectStillDocument(page);
  });
}

for (const viewport of [
  { width: 2000, height: 1093 },
  { width: 390, height: 844 },
]) {
  test(`keeps the document still while diagrams render at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const samples = await sampleDocumentScroll(page);
    const { diagrams } = await installDiagramConversation(page);
    await page.goto(LONG_CONVERSATION_PATH);
    const rendered = page.locator('[data-slot="mermaid-diagram"]:not([data-state="pending"])');
    await expect(rendered).toHaveCount(diagrams, { timeout: 20_000 });
    // Mermaid lays each diagram out in an element it appends to the body: it must have happened,
    // and it must never have lengthened or scrolled the document.
    expect(await samples()).toEqual({ top: 0, excess: 0, sawBodyMeasure: true });
    await expectStillDocument(page);
  });
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 667, height: 375 },
]) {
  test(`opens the narrow conversations list under the bar at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await installLongConversation(page);
    await page.goto(LONG_CONVERSATION_PATH);
    const main = page.locator('#main-content');
    await expect(main).toBeVisible();
    const toggle = page.locator('header').getByRole('button', { name: /les conversations$/u });
    const barY = (await toggle.boundingBox())!.y;
    await toggle.click();
    const history = page.locator('#conversation-history');
    await expect(history).toBeVisible();
    await expect(main).toBeHidden();
    // The bar stays where it was; a screen too short for the whole list scrolls it into reach.
    expect((await toggle.boundingBox())!.y).toBe(barY);
    await expect(
      page.getByRole('button', { name: 'Nouvelle conversation', exact: true }),
    ).toBeVisible();
    const account = page.getByRole('button', { name: /menu du compte/u });
    await account.scrollIntoViewIfNeeded();
    await expect(account).toBeInViewport({ ratio: 1 });
    await expect(toggle).toBeInViewport({ ratio: 1 });
    await expectStillDocument(page);
    await page.getByRole('button', { name: 'Masquer les conversations' }).click();
    await expect(history).toBeHidden();
    await expect(main).toBeVisible();
    await expectStillDocument(page);
  });
}

// Screens that still grow with their content scroll in the stage cell below the breakpoint.
for (const viewport of [
  { width: 1100, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`scrolls growing screens in the stage at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const project = await installProjectChats(page);
    await enableSkills(page);
    await page.goto(project.path);
    const chats = page.getByRole('list', { name: 'Chats du projet' });
    await expect(chats.getByRole('listitem').first()).toBeVisible();
    // Scrolling reaches every page of the list, up to its last chat.
    const last = chats.getByText(project.lastTitle, { exact: true });
    await expect(async () => {
      await chats.getByRole('listitem').last().scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport({ ratio: 1, timeout: 500 });
    }).toPass();
    await expectStillDocument(page);

    await page.goto('/app/skills/new');
    const header = page.locator('[data-slot="skill-editor-header"]');
    await expect(header).toBeVisible();
    const stage = page.locator('#main-content').locator('xpath=..');
    const overflow = await stage.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      return element.scrollTop;
    });
    expect(overflow).toBeGreaterThan(0);
    // The editor's header stays pinned while its body scrolls away under it.
    await expect(header).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeInViewport();
    await expectStillDocument(page);
  });
}
