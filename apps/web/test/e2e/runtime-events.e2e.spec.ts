import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

import { DISABLED_FEATURE_FLAGS } from '../../src/services/feature-flags/feature-flags';
import { CONVERSATION_ID, installWorkspaceApi } from './support/workspace-api';

const userId = '21dd1aaa-d564-4a45-9a07-dbc5777d25d5';
const key = `alfred:runtime-event-debug:v1:${userId}:${CONVERSATION_ID}`;
const enabled = process.env.VITE_DEBUG_EVENTS === 'true';
const events = Array.from({ length: 205 }, (_, id) => ({
  event: 'custom',
  data: { sequence: id, content: `event-${id}-${'x'.repeat(700)}` },
}));

for (const width of [390, 1440]) {
  test(`debug events capture, download and reload at ${width}px (enabled=${enabled})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    await installWorkspaceApi(page);
    await page.route('**/api/auth/refresh', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            accessToken: 'e2e-memory-only-token',
            user: {
              id: userId,
              displayName: 'Ada',
              email: 'ada@example.test',
              role: 'user',
            },
          },
        },
      }),
    );
    await page.route('**/api/features', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: { ...DISABLED_FEATURE_FLAGS, agentRuntime: true },
        },
      }),
    );
    await page.route('**/api/conversations/*/messages', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: { items: [] },
        },
      }),
    );
    await page.route('**/api/conversations/*/executions', (route) =>
      route.fulfill({
        contentType: 'text/event-stream',
        body: events
          .map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`)
          .join(''),
      }),
    );
    await page.goto(`/app/conversations/${CONVERSATION_ID}`);
    await page.getByLabel('Message', { exact: true }).fill('Diagnostic test');
    await page.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect(page.getByText('La réponse a été interrompue avant la fin.')).toBeVisible();
    if (!enabled) {
      await expect(page.getByText(/Événements du runtime/u)).toHaveCount(0);
      expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBeNull();
      return;
    }
    await expect(page.getByText('Événements du runtime (205)')).toBeVisible();
    await page.getByText('Événements du runtime (205)').click();
    const region = page.getByRole('region', { name: 'Événements capturés' });
    await expect(region).toBeVisible();
    expect(
      await region.evaluate((element) => ({
        horizontal: element.scrollWidth > element.clientWidth,
        vertical: element.scrollHeight > element.clientHeight,
      })),
    ).toEqual({ horizontal: true, vertical: true });
    await region.evaluate((element) => {
      element.scrollLeft = 200;
      element.scrollTop = 200;
    });
    expect(
      await region.evaluate((element) => element.scrollLeft > 0 && element.scrollTop > 0),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Télécharger les événements' }).click();
    const download = await downloaded;
    const path = await download.path();
    const exported = JSON.parse(await readFile(path, 'utf8')) as unknown[];
    expect(exported).toEqual(events.map((event, index) => ({ ...event, id: index + 1 })));
    await expect
      .poll(() =>
        page.evaluate((storageKey) => {
          const raw = localStorage.getItem(storageKey);
          return raw ? (JSON.parse(raw) as { events: unknown[] }).events.length : 0;
        }, key),
      )
      .toBe(205);
    await page.reload();
    await expect(page.getByText('Événements du runtime (205)')).toBeVisible();
    await page.getByText('Événements du runtime (205)').click();
    await expect(page.getByRole('region', { name: 'Événements capturés' })).toContainText(
      'event-204-',
    );
  });
}
