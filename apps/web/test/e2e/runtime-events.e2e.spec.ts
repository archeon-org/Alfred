import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

import { diagnosticEvents, encodeAgUiFrames, synthesizeRun } from '../support/ag-ui-synth';
import { EXECUTION_ID, executionSnapshot, installExecutionApi } from './support/executions-api';
import { CONVERSATION_ID } from './support/workspace-api';

const userId = '21dd1aaa-d564-4a45-9a07-dbc5777d25d5';
const key = `alfred:runtime-event-debug:v3:${userId}:${CONVERSATION_ID}`;
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
const events = diagnosticEvents(frames);

for (const width of [390, 1440]) {
  test(`debug events capture, download and reload at ${width}px (enabled=${enabled})`, async ({
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
    if (!enabled) {
      await expect(page.getByText(/Événements du runtime/u)).toHaveCount(0);
      expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBeNull();
      return;
    }
    await expect(page.getByText(`Événements du runtime (${events.length})`)).toBeVisible();
    await page.getByText(`Événements du runtime (${events.length})`).click();
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
    expect(exported).toEqual(events);
    await expect
      .poll(() =>
        page.evaluate((storageKey) => {
          const raw = localStorage.getItem(storageKey);
          return raw ? (JSON.parse(raw) as { events: unknown[] }).events.length : 0;
        }, key),
      )
      .toBe(events.length);
    await page.reload();
    await expect(page.getByText(`Événements du runtime (${events.length})`)).toBeVisible();
    await page.getByText(`Événements du runtime (${events.length})`).click();
    await expect(page.getByRole('region', { name: 'Événements capturés' })).toContainText(
      'event-204-',
    );
  });
}
