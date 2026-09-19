import type { ExecutionSnapshot } from '@alfred/contracts';
import { expect, test } from '@playwright/test';

import { preferChat } from './support/chat-preferences';
import { EXECUTION_ID, executionSnapshot, sse } from './support/executions-api';
import { installLongConversation, LONG_CONVERSATION_PATH } from './support/long-conversation';
import { installStreamedTurn } from './support/streamed-turn';
import {
  recordTranscriptScrolls,
  expectDocumentStill,
  growTranscript,
  pressKey,
  scrollMetrics,
  settledTop,
  shrinkThenGrow,
  TRANSCRIPT_SCROLLER,
  wheelToEnd,
} from './support/transcript-scroll';

// Browser errors are printed with the test title so every run reports them.
test.beforeEach(({ page }, testInfo) => {
  page.on('console', (message) => {
    if (message.type() === 'error')
      console.log(`[console error] ${testInfo.title}: ${message.text().slice(0, 300)}`);
  });
  page.on('pageerror', (error) =>
    console.log(`[page error] ${testInfo.title}: ${error.message.slice(0, 300)}`),
  );
});

const gap = async (page: Parameters<typeof scrollMetrics>[0]) => (await scrollMetrics(page)).gap;

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`lands at the bottom, follows growth smoothly and lets the person scroll away at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const scrolls = await recordTranscriptScrolls(page);
    const { lastAnswer } = await installLongConversation(page);
    await page.goto(LONG_CONVERSATION_PATH);
    await expect(page.getByText(lastAnswer)).toBeAttached();
    await expect.poll(() => gap(page)).toBeLessThanOrEqual(1);
    expect((await scrollMetrics(page)).overflow).toBeGreaterThan(2_000);
    // Opening lands on the bottom in a few jumps (the skeleton, the transcript, the composer's
    // arrival); an eased scroll through the whole history would pass through dozens of positions.
    const opening = await scrolls();
    expect(opening.length).toBeGreaterThan(0);
    expect(new Set(opening).size).toBeLessThanOrEqual(6);
    await expectDocumentStill(page);

    // Content growing at the bottom is followed by an animation that ends pinned to the bottom.
    const followed = await growTranscript(page, 700);
    expect(followed.filter((distance) => distance > 1 && distance < 700).length).toBeGreaterThan(2);
    expect(followed.at(-1)).toBeLessThanOrEqual(1);
    await expectDocumentStill(page);

    // A wheel up stops following at once: more growth leaves the view where the person put it.
    const box = (await page.locator(TRANSCRIPT_SCROLLER).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -600);
    const reading = await settledTop(page);
    const away = await gap(page);
    expect(away).toBeGreaterThan(200);
    const ignored = await growTranscript(page, 500, 400);
    expect((await scrollMetrics(page)).top).toBe(reading);
    expect(ignored.at(-1)).toBeGreaterThanOrEqual(away + 500);
    await expectDocumentStill(page);

    // Scrolling back down to the bottom follows again.
    await wheelToEnd(page, 'bottom');
    await expect.poll(() => gap(page)).toBeLessThanOrEqual(1);
    const resumed = await growTranscript(page, 400);
    expect(resumed.at(-1)).toBeLessThanOrEqual(1);
    await expectDocumentStill(page);
  });
}

test('sending a message brings the person back to the bottom and follows the streamed answer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { lastAnswer } = await installLongConversation(page);
  // After the stored history, so the new turn is placed at the end of the transcript.
  const later = (snapshot: ExecutionSnapshot): ExecutionSnapshot => ({
    ...snapshot,
    execution: { ...snapshot.execution, createdAt: '2026-09-12T09:00:00.000Z' },
  });
  const answer = [
    ...Array.from(
      { length: 10 },
      (_, index) =>
        `Paragraphe ${index + 1} de la réponse. ${'Du texte pour allonger la réponse. '.repeat(8)}`,
    ),
    'Fin de la réponse diffusée.',
  ].join('\n\n');
  const done = later(executionSnapshot(2, answer, 'completed'));
  await page.route('**/api/conversations/*/executions', (route) =>
    route.fulfill({ json: { success: true, data: { snapshot: later(executionSnapshot()) } } }),
  );
  await page.route('**/api/conversations/*/executions/active', (route) =>
    route.fulfill({ json: { success: true, data: { snapshot: null } } }),
  );
  await page.route(`**/api/executions/${EXECUTION_ID}`, (route) =>
    route.fulfill({ json: { success: true, data: { snapshot: done } } }),
  );
  await page.route(`**/api/executions/${EXECUTION_ID}/events`, (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: sse(later(executionSnapshot(1, answer.slice(0, 300))), done),
    }),
  );
  await page.goto(LONG_CONVERSATION_PATH);
  await expect(page.getByText(lastAnswer)).toBeInViewport();
  expect(await wheelToEnd(page, 'top')).toBe(0);

  await page.getByLabel('Message', { exact: true }).fill('Une réponse longue ?');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  await expect(page.getByText('Fin de la réponse diffusée.')).toBeInViewport();
  await expect.poll(() => gap(page)).toBeLessThanOrEqual(1);
  await expectDocumentStill(page);
});

for (const viewport of VIEWPORTS) {
  test(`the scrolling keys scroll the transcript from the page focus or after a click in its text at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const { lastAnswer } = await installLongConversation(page);
    await page.goto(LONG_CONVERSATION_PATH);
    await expect(page.getByText(lastAnswer)).toBeAttached();
    await expect.poll(() => gap(page)).toBeLessThanOrEqual(1);

    // <main> holds the focus after a route change or the skip link: the keys scroll the transcript,
    // and scrolling up stops following.
    await page.locator('#main-content').focus();
    const bottom = (await scrollMetrics(page)).top;
    await pressKey(page, 'PageUp');
    await expect(page.locator(TRANSCRIPT_SCROLLER)).toBeFocused();
    const reading = await settledTop(page);
    expect(reading).toBeLessThan(bottom - 200);
    await growTranscript(page, 300, 300);
    expect((await scrollMetrics(page)).top).toBe(reading);
    await pressKey(page, 'End');
    await expect.poll(() => gap(page)).toBeLessThanOrEqual(1);
    expect((await growTranscript(page, 300)).at(-1)).toBeLessThanOrEqual(1);

    // A click in the text focuses the transcript, so the keys keep scrolling it.
    await page.locator(TRANSCRIPT_SCROLLER).locator('li p').last().click();
    await expect(page.locator(TRANSCRIPT_SCROLLER)).toBeFocused();
    for (const key of ['ArrowUp', 'PageUp', 'Shift+Space', 'Home']) {
      const before = await settledTop(page);
      await pressKey(page, key);
      await expect.poll(() => settledTop(page)).toBeLessThan(before);
    }
    expect(await settledTop(page)).toBe(0);
    await expectDocumentStill(page);
  });
}

test('keeps following when the end of the transcript folds and grows again before the browser reports it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { lastAnswer } = await installLongConversation(page);
  await page.goto(LONG_CONVERSATION_PATH);
  await expect(page.getByText(lastAnswer)).toBeInViewport();
  await expect.poll(() => gap(page)).toBeLessThanOrEqual(1);
  // A layout read between the fold and the growth, then the frame's own layout.
  for (const forcedLayout of [true, false]) {
    const gaps = await shrinkThenGrow(page, { forcedLayout });
    expect(gaps.filter((distance) => distance > 1).length).toBeGreaterThan(2);
    expect(gaps.at(-1)).toBeLessThanOrEqual(1);
  }
  await expectDocumentStill(page);
});

test('follows a live answer while its reasoning streams, folds and gives way to the answer', async ({
  page,
}) => {
  // Reasoning streams in the open in the detailed chat mode (Paramètres › Chat).
  await preferChat(page, 'detailed');
  await page.setViewportSize({ width: 1440, height: 900 });
  const { lastAnswer } = await installLongConversation(page);
  const turn = await installStreamedTurn(page);
  await page.goto(LONG_CONVERSATION_PATH);
  await expect(page.getByText(lastAnswer)).toBeInViewport();
  await page.getByLabel('Message', { exact: true }).fill('Une question ?');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  const reasoning = page.locator('[data-slot="reasoning-step"]');
  // Each change is rendered, the view settles, and it is still at the bottom.
  const pinnedOnce = async (rendered: ReturnType<typeof page.getByText>) => {
    await expect(rendered).toBeAttached();
    await settledTop(page);
    await expect.poll(() => gap(page)).toBeLessThanOrEqual(1);
  };
  await pinnedOnce(page.getByText('Réflexion'));
  for (let step = 1; step <= turn.reasoningSteps; step += 1) {
    await turn.stream.next();
    await pinnedOnce(page.getByText(`Ligne ${step * 4} de la réflexion`));
  }
  await expect(reasoning).toHaveAttribute('open', '');
  // The reasoning completes and the answer starts back to back: the row folds, the answer grows.
  await turn.stream.next(2);
  await pinnedOnce(page.getByText('Paragraphe 1 de la réponse.'));
  await expect(reasoning).not.toHaveAttribute('open', '');
  for (let step = 2; step < turn.answerSteps; step += 1) {
    await turn.stream.next();
    await pinnedOnce(page.getByText(`Paragraphe ${step} de la réponse.`));
  }

  // A key scrolling up during the stream stops following: the rest of the answer leaves the view.
  await page.locator('#main-content').focus();
  await pressKey(page, 'PageUp');
  const reading = await settledTop(page);
  await turn.stream.next();
  await expect(page.getByText(turn.lastParagraph)).toBeAttached();
  expect(await settledTop(page)).toBe(reading);
  expect(await gap(page)).toBeGreaterThan(200);
  await expectDocumentStill(page);
});

test('the composer masks nothing above it and its shadow follows the theme', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { lastAnswer } = await installLongConversation(page);
  await page.goto(LONG_CONVERSATION_PATH);
  await expect(page.getByText(lastAnswer)).toBeInViewport();
  const composer = page.locator('form', { has: page.getByLabel('Message', { exact: true }) });
  for (const [scheme, color] of [
    ['light', 'rgba(51, 67, 38, 0.14)'],
    ['dark', 'rgba(0, 0, 0, 0.35)'],
  ] as const) {
    // The theme the preferences resolve to, set directly: only the tokens are under test.
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), scheme);
    // The shadow transitions to the theme's color.
    await expect
      .poll(() => composer.evaluate((form) => getComputedStyle(form).boxShadow))
      .toContain(color);
    // Right above its border lies the transcript itself, not a band of the composer area.
    const above = await composer.evaluate((form, selector) => {
      const box = form.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top - 2);
      return hit !== null && hit.closest(selector) !== null;
    }, TRANSCRIPT_SCROLLER);
    expect(above).toBe(true);
  }
});
