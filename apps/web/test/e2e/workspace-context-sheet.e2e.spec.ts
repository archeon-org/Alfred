import { expect, test } from '@playwright/test';

import { installLongConversation, LONG_CONVERSATION_PATH } from './support/long-conversation';
import { expectStillDocument, logBrowserErrors, SHEET_VIEWPORTS } from './support/workspace-shell';

// Below the workspace breakpoint (1200 px) the context panel is a sheet over the conversation.
// Browser errors are printed with the test title so every run reports them.
test.beforeEach(({ page }, testInfo) => logBrowserErrors(page, testInfo.title));

for (const viewport of SHEET_VIEWPORTS) {
  test(`lays the context panel over the conversation at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await installLongConversation(page);
    await page.goto(LONG_CONVERSATION_PATH);
    await expect(page.locator('#main-content')).toBeVisible();
    const context = page.getByRole('complementary', { name: 'Contexte de la conversation' });
    const sheet = page.getByRole('dialog', { name: 'Contexte de la conversation' });
    // The gutter button from md, the narrow bar's button below it: the same dialog trigger.
    const opener = page.getByRole('button', { name: 'Afficher le contexte' });
    const close = sheet.getByRole('button', { name: 'Masquer le contexte' });
    const chat = page.locator('#conversation');
    await expect(context).toHaveCount(0);
    await expect(opener).toHaveAttribute('aria-expanded', 'false');
    await expect(opener).toHaveAttribute('aria-haspopup', 'dialog');
    const chatBefore = await chat.boundingBox();

    await opener.click();
    await expect(sheet).toBeVisible();
    // Équipes follows the teams capability, off in this seed; Skills is always there.
    await expect(sheet.getByRole('tab', { name: 'Skills' })).toBeVisible();
    await expect(close).toBeFocused();
    expect(await chat.boundingBox()).toEqual(chatBefore);
    expect(await sheet.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
    // The sheet slides in from the right edge; read its bounds once it has arrived.
    await expect
      .poll(async () => {
        const box = await sheet.boundingBox();
        return box === null ? 0 : box.x + box.width;
      })
      .toBeCloseTo(viewport.width, 0);
    const bounds = (await sheet.boundingBox())!;
    expect(bounds.y).toBe(0);
    expect(bounds.height).toBeCloseTo(viewport.height, 0);
    if (viewport.width < 768) expect(bounds.width).toBeGreaterThanOrEqual(viewport.width - 48);
    else expect(bounds.width).toBeLessThanOrEqual(viewport.width / 2);
    await expectStillDocument(page);

    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(context).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await chat.boundingBox()).toEqual(chatBefore);

    // A click on the backdrop and the panel's own button close it the same way.
    await opener.click();
    await expect(close).toBeFocused();
    await page.mouse.click(8, viewport.height / 2);
    await expect(sheet).toHaveCount(0);
    await expect(opener).toBeFocused();
    await opener.click();
    await close.click();
    await expect(sheet).toHaveCount(0);
    await expect(opener).toBeFocused();

    // The keyboard shortcut toggles the sheet too.
    await page.keyboard.press('ControlOrMeta+Shift+Period');
    await expect(sheet).toBeVisible();
    await page.keyboard.press('ControlOrMeta+Shift+Period');
    await expect(sheet).toHaveCount(0);
    await expectStillDocument(page);
  });
}

test('folds the context sheet when the window crosses the workspace breakpoint', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await installLongConversation(page);
  await page.goto(LONG_CONVERSATION_PATH);
  const context = page.getByRole('complementary', { name: 'Contexte de la conversation' });
  const sheet = page.getByRole('dialog', { name: 'Contexte de la conversation' });
  await page.getByRole('button', { name: 'Afficher le contexte' }).click();
  await expect(sheet).toBeVisible();
  // Wider, the docked panel keeps its own (preference-driven) state and no overlay remains.
  await page.setViewportSize({ width: 1440, height: 800 });
  await expect(sheet).toHaveCount(0);
  await expect(context).toBeVisible();
  await expect(
    page.getByRole('separator', { name: 'Redimensionner le panneau de contexte' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(context).toHaveCount(0);
  await expectStillDocument(page);
});

for (const [from, to] of [
  [1100, 700],
  [700, 1100],
] as const) {
  test(`returns focus to the opener on screen after crossing md from ${from} to ${to}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: from, height: 800 });
    await installLongConversation(page);
    await page.goto(LONG_CONVERSATION_PATH);
    const sheet = page.getByRole('dialog', { name: 'Contexte de la conversation' });
    await page.getByRole('button', { name: 'Afficher le contexte' }).click();
    await expect(sheet).toBeVisible();
    // The gutter button and the bar button swap places; the sheet stays open.
    await page.setViewportSize({ width: to, height: 800 });
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    const opener = page.getByRole('button', { name: 'Afficher le contexte' });
    await expect(opener).toBeFocused();
    expect(await opener.evaluate((element) => element.closest('header') !== null)).toBe(to < 768);
  });
}
