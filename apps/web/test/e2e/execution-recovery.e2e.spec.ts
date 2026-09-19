import { expect, test, type Route } from '@playwright/test';

import {
  EXECUTION_ID,
  executionSnapshot,
  installExecutionApi,
  sse,
} from './support/executions-api';
import { CONVERSATION_ID } from './support/workspace-api';

for (const width of [390, 1440]) {
  test(`reload rejoins the existing execution and Stop waits for confirmation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const api = await installExecutionApi(page);
    const observers: Route[] = [];
    const cursors: (string | undefined)[] = [];
    await page.route(`**/api/executions/${EXECUTION_ID}/events`, async (route) => {
      cursors.push(route.request().headers()['last-event-id']);
      if (cursors.length === 1) {
        api.set(executionSnapshot(1, 'Réponse partielle'));
        await route.fulfill({ contentType: 'text/event-stream', body: sse(api.current!) });
      } else observers.push(route);
    });
    await page.goto(`/app/conversations/${CONVERSATION_ID}`);
    await page.getByLabel('Message', { exact: true }).fill('Diagnostic test');
    await page.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect(page.getByText('Réponse partielle', { exact: true })).toBeVisible();
    await expect.poll(() => cursors.length).toBeGreaterThanOrEqual(2);
    await page.reload();
    await expect(page.getByText('Réponse partielle', { exact: true })).toBeVisible();
    await expect.poll(() => cursors.length).toBeGreaterThanOrEqual(3);
    expect(api.submissions).toHaveLength(1);
    expect(cursors.at(-1)).toBe('cursor:1');
    await page.getByRole('button', { name: 'Arrêter la réponse', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Arrêt demandé… confirmation en cours.');
    expect(api.stops).toBe(1);
    await expect(page.getByRole('button', { name: 'Envoyer le message' })).toHaveCount(0);
    api.set(executionSnapshot(1, 'Réponse partielle', 'cancelled'));
    await Promise.all(
      observers.map((route) =>
        route
          .fulfill({ contentType: 'text/event-stream', body: sse(api.current!) })
          .catch(() => undefined),
      ),
    );
    await expect(page.getByRole('button', { name: 'Envoyer le message' })).toBeVisible();
    await expect(page.getByText('Réponse partielle', { exact: true })).toHaveCount(1);
    await expect(page.getByRole('status')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain(
      'e2e-memory-only-token',
    );
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
      'e2e-memory-only-token',
    );
  });
}

test('an early disconnect resumes from the last cursor and renders the final answer once', async ({
  page,
}) => {
  const api = await installExecutionApi(page);
  let connections = 0;
  await page.route(`**/api/executions/${EXECUTION_ID}/events`, async (route) => {
    connections += 1;
    if (connections === 1) {
      api.set(executionSnapshot(1, 'Bon'));
      await route.fulfill({ contentType: 'text/event-stream', body: sse(api.current!) });
    } else {
      expect(route.request().headers()['last-event-id']).toBe('cursor:1');
      api.set(executionSnapshot(2, 'Bonjour, réponse terminée.', 'completed'));
      await route.fulfill({
        contentType: 'text/event-stream',
        body: sse(executionSnapshot(1, 'Bon')) + sse(api.current!),
      });
    }
  });
  await page.goto(`/app/conversations/${CONVERSATION_ID}`);
  await page.getByLabel('Message', { exact: true }).fill('Diagnostic test');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  await expect(page.getByText('Bonjour, réponse terminée.', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Envoyer le message' })).toBeVisible();
  expect(api.submissions).toHaveLength(1);
  expect(connections).toBe(2);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
