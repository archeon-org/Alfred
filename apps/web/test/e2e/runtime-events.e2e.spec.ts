import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

import { diagnosticEvents, encodeAgUiFrames, synthesizeRun } from '../support/ag-ui-synth';
import { EXECUTION_ID, executionSnapshot, installExecutionApi } from './support/executions-api';
import { CONVERSATION_ID } from './support/workspace-api';

const userId = '21dd1aaa-d564-4a45-9a07-dbc5777d25d5';
const key = `alfred:runtime-event-debug:v4:${userId}:${CONVERSATION_ID}`;
const enabled = process.env.VITE_DEBUG_EVENTS === 'true';
// Cumulative answers: every snapshot extends the previous one, as the API projection does.
const snapshots = Array.from({ length: 205 }, (_, id) =>
  executionSnapshot(
    id + 1,
    Array.from({ length: id + 1 }, (_, index) => `event-${index}-${'x'.repeat(700)}`).join('\n'),
    id === 204 ? 'completed' : 'running',
  ),
);
const frames = synthesizeRun(snapshots).flat();
const events = diagnosticEvents(frames, EXECUTION_ID);
const eventsButton = `Événements du runtime (${events.length})`;

for (const width of [390, 1440]) {
  test(`debug events per answer: capture, dialog, download and reload at ${width}px (enabled=${enabled})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const api = await installExecutionApi(page);
    await page.route(`**/api/executions/${EXECUTION_ID}/events`, (route) => {
      api.set(snapshots.at(-1)!);
      return route.fulfill({
        contentType: 'text/event-stream',
        body: encodeAgUiFrames(frames),
      });
    });
    await page.goto(`/app/conversations/${CONVERSATION_ID}`);
    await page.getByLabel('Message', { exact: true }).fill('Diagnostic test');
    await page.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect(page.getByRole('button', { name: 'Envoyer le message' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copier la réponse' })).toBeVisible();
    if (!enabled) {
      await expect(page.getByRole('button', { name: /Événements du runtime/u })).toHaveCount(0);
      expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBeNull();
      return;
    }
    // The events belong to this answer: one button under it, none elsewhere.
    await expect(page.getByRole('button', { name: /Événements du runtime/u })).toHaveCount(1);
    await page.getByRole('button', { name: eventsButton }).click();
    const dialog = page.getByRole('dialog', { name: 'Événements du runtime' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(EXECUTION_ID);
    const region = dialog.getByRole('region', { name: 'Événements capturés' });
    await expect(region.getByRole('listitem')).toHaveCount(events.length);
    await region.getByText('TEXT_MESSAGE_CONTENT', { exact: true }).last().click();
    expect(
      await region.evaluate((element) => ({
        horizontal: element.scrollWidth > element.clientWidth,
        vertical: element.scrollHeight > element.clientHeight,
      })),
    ).toEqual({ horizontal: true, vertical: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const downloaded = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Télécharger le JSON' }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe(`alfred-events-${EXECUTION_ID}.json`);
    const exported = JSON.parse(await readFile(await download.path(), 'utf8')) as unknown[];
    expect(exported).toEqual(events);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: eventsButton })).toBeFocused();
    await expect
      .poll(() =>
        page.evaluate((storageKey) => {
          const raw = localStorage.getItem(storageKey);
          return raw ? (JSON.parse(raw) as { events: unknown[] }).events.length : 0;
        }, key),
      )
      .toBe(events.length);
    // After a reload the stored answer still owns its events through its execution id.
    const stored = (role: 'user' | 'assistant', content: string, id: string) => ({
      id,
      conversationId: CONVERSATION_ID,
      executionId: EXECUTION_ID,
      role,
      content,
      createdAt: '2026-09-11T09:00:01.000Z',
    });
    await page.route('**/api/conversations/*/messages', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            items: [
              stored('user', 'Diagnostic test', '33333333-3333-4333-8333-333333333333'),
              stored(
                'assistant',
                snapshots.at(-1)!.assistantText,
                '44444444-4444-4444-8444-444444444444',
              ),
            ],
          },
        },
      }),
    );
    await page.reload();
    await expect(page.getByRole('button', { name: eventsButton })).toBeVisible();
    await page.getByRole('button', { name: eventsButton }).click();
    await region.getByText('TEXT_MESSAGE_CONTENT', { exact: true }).last().click();
    await expect(region).toContainText('event-204-');
  });
}
