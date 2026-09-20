import { expect, test, type Page } from '@playwright/test';

import {
  installConcurrentExecutionApi,
  SECOND_CONVERSATION_ID,
} from './support/concurrent-executions-api';
import { CONVERSATION_ID } from './support/workspace-api';

async function selectChat(page: Page, name: string) {
  const open = page.getByRole('button', { name: /^Afficher (les conversations|la navigation)$/u });
  if (await open.isVisible()) await open.click();
  await page.getByRole('button', { name: new RegExp(`^${name}`, 'u') }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

for (const width of [390, 1440]) {
  test(`independent chats survive simultaneous progress, background completion and isolated Stop at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const api = await installConcurrentExecutionApi(page);
    await page.goto(`/app/conversations/${CONVERSATION_ID}`);
    await page.getByLabel('Message', { exact: true }).fill('First request');
    await page.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect(page.getByText('Progress Chat A 40', { exact: true })).toBeVisible();
    await selectChat(page, 'Chat B');
    await page.getByLabel('Message', { exact: true }).fill('Second request');
    await page.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect(page.getByText('Progress Chat B 40', { exact: true })).toBeVisible();
    expect(api.submissions).toHaveLength(2);
    expect(new Set(api.submissions.map((item) => item.submissionId)).size).toBe(2);
    expect(api.listRequests).toBeLessThanOrEqual(10);
    await expect(page.getByText('Progress Chat A 40', { exact: true })).toHaveCount(0);
    for (const name of ['Chat A', 'Chat B', 'Chat A', 'Chat B']) {
      await selectChat(page, name);
      await expect(page.getByText(`Progress ${name} 40`, { exact: true })).toBeVisible();
    }
    expect(api.submissions).toHaveLength(2);
    await expect.poll(() => api.pendingObservers(CONVERSATION_ID)).toBe(1);
    await expect.poll(() => api.pendingObservers(SECOND_CONVERSATION_ID)).toBe(1);
    // A completes while B is selected; B must keep its own pending Stop and output.
    await api.finish(CONVERSATION_ID, 'Finished A', 'completed');
    await expect(
      page.getByRole('button', { name: 'Arrêter la réponse', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Arrêter la réponse', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Arrêt demandé… confirmation en cours.');
    expect(api.stops).toEqual([SECOND_CONVERSATION_ID]);
    await selectChat(page, 'Chat A');
    await expect(page.getByText('Finished A', { exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Envoyer le message' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
    await selectChat(page, 'Chat B');
    await expect(page.getByText('Progress Chat B 40', { exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Arrêt demandé… confirmation en cours.');
    await api.finish(SECOND_CONVERSATION_ID, 'Stopped B', 'cancelled');
    await expect(page.getByText('Stopped B', { exact: true })).toHaveCount(1);
    await page.getByLabel('Message', { exact: true }).fill('Next request');
    await expect(page.getByRole('button', { name: 'Envoyer le message' })).toBeEnabled();
    expect(api.submissions).toHaveLength(2);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('reload recovers both active conversations with their own cursors and no extra submission', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const api = await installConcurrentExecutionApi(page);
  await page.goto(`/app/conversations/${CONVERSATION_ID}`);
  await page.getByLabel('Message', { exact: true }).fill('First request');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  await expect(page.getByText('Progress Chat A 40', { exact: true })).toBeVisible();
  await selectChat(page, 'Chat B');
  await page.getByLabel('Message', { exact: true }).fill('Second request');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  await expect(page.getByText('Progress Chat B 40', { exact: true })).toBeVisible();
  await expect.poll(() => api.pendingObservers(SECOND_CONVERSATION_ID)).toBe(1);
  await expect.poll(() => api.pendingObservers(CONVERSATION_ID)).toBe(1);

  await page.reload();
  await expect(page.getByText('Progress Chat B 40', { exact: true })).toHaveCount(1);
  await expect.poll(() => api.pendingObservers(SECOND_CONVERSATION_ID)).toBe(2);
  expect(
    api.connections.filter((item) => item.conversationId === SECOND_CONVERSATION_ID).at(-1)?.cursor,
  ).toBe(`${SECOND_CONVERSATION_ID}:40`);
  await expect(page.getByText('Progress Chat A 40', { exact: true })).toHaveCount(0);

  await selectChat(page, 'Chat A');
  await expect(page.getByText('Progress Chat A 40', { exact: true })).toHaveCount(1);
  await expect.poll(() => api.pendingObservers(CONVERSATION_ID)).toBe(2);
  expect(
    api.connections.filter((item) => item.conversationId === CONVERSATION_ID).at(-1)?.cursor,
  ).toBe(`${CONVERSATION_ID}:40`);
  await expect(page.getByText('Progress Chat B 40', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Arrêter la réponse', exact: true })).toBeVisible();
  expect(api.submissions).toHaveLength(2);
  expect(api.stops).toEqual([]);
  expect(errors).toEqual([]);
});

test('background completion preserves the other conversation draft and its usable composer', async ({
  page,
}) => {
  const api = await installConcurrentExecutionApi(page);
  await page.goto(`/app/conversations/${CONVERSATION_ID}`);
  await page.getByLabel('Message', { exact: true }).fill('First request');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  await expect(page.getByText('Progress Chat A 40', { exact: true })).toBeVisible();
  await expect.poll(() => api.pendingObservers(CONVERSATION_ID)).toBe(1);
  await selectChat(page, 'Chat B');
  await page.getByLabel('Message', { exact: true }).fill('Draft in second chat');

  await api.finish(CONVERSATION_ID, 'Finished in background', 'completed');
  await expect(page.getByText('Réponse en cours', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Chat B', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('Draft in second chat');
  await expect(page.getByRole('button', { name: 'Envoyer le message' })).toBeEnabled();
  await expect(page.getByText('Finished in background', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  await expect(page.getByText('Progress Chat B 40', { exact: true })).toBeVisible();
  expect(
    api.submissions.map(({ conversationId, message }) => ({ conversationId, message })),
  ).toEqual([
    { conversationId: CONVERSATION_ID, message: 'First request' },
    { conversationId: SECOND_CONVERSATION_ID, message: 'Draft in second chat' },
  ]);
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('');
});
