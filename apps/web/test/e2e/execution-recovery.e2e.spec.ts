import type { ExecutionSnapshot, WorkStep } from '@alfred/contracts';
import { expect, test, type Page, type Route } from '@playwright/test';

import {
  EXECUTION_ID,
  executionSnapshot,
  installExecutionApi,
  sse,
} from './support/executions-api';
import { serveProgressiveRun, snapshotRun } from './support/progressive-run';
import { CONVERSATION_ID } from './support/workspace-api';

// Browser errors are printed with the test title so every run reports them.
test.beforeEach(({ page }, testInfo) => {
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      console.log(`[console ${message.type()}] ${testInfo.title}: ${message.text().slice(0, 300)}`);
  });
  page.on('pageerror', (error) =>
    console.log(`[page error] ${testInfo.title}: ${error.message.slice(0, 300)}`),
  );
});

const T0 = Date.parse('2026-09-11T09:00:00.000Z');
const thought = (id: string, at: number, status: WorkStep['status']): WorkStep => ({
  id,
  kind: 'reasoning',
  label: '',
  status,
  startedAt: T0 + at,
  finishedAt: status === 'running' ? null : T0 + at + 900,
  text: `Réflexion ${id} : comparer les dépendances.\n\nPuis vérifier la version déployée.`,
});
const tool = (id: string, at: number, status: WorkStep['status']): WorkStep => ({
  id,
  kind: 'tool',
  label: `lire_${id}`,
  status,
  startedAt: T0 + at,
  finishedAt: status === 'running' ? null : T0 + at + 400,
});
const paragraph = (index: number) => `Paragraphe ${index} de la réponse.`;

/** A run that grows by one reasoning, one tool and one paragraph per commit, then completes. */
function growingRun(commits: number): ExecutionSnapshot[] {
  return Array.from({ length: commits + 1 }, (_, index) => {
    const settled = index === commits;
    const base = executionSnapshot(index + 1, '', settled ? 'completed' : 'running');
    const count = Math.min(index + 1, commits);
    return {
      ...base,
      assistantText: Array.from({ length: count }, (_, item) => paragraph(item + 1)).join('\n\n'),
      work: {
        steps: Array.from({ length: count }, (_, item) => [
          thought(`r${item}`, item * 2_000, 'completed'),
          tool(
            `t${item}`,
            item * 2_000 + 1_000,
            settled || item < count - 1 ? 'completed' : 'running',
          ),
        ]).flat(),
        omittedSteps: 0,
      },
      execution: {
        ...base.execution,
        finishedAt: settled ? '2026-09-11T09:01:00.000Z' : null,
      },
    };
  });
}

/** Records, every frame, the step rows, the answer length and the status line of the live turn. */
async function sampleTurn(page: Page) {
  await page.evaluate(() => {
    const samples: { rows: number; text: number; status: string }[] = [];
    Object.assign(window, { __turnSamples: samples });
    const sample = () => {
      const log = document.querySelector('[data-slot="execution-work-log"]');
      const turn = log?.closest('li');
      samples.push({
        rows: log?.querySelectorAll('ol[aria-label] > li').length ?? 0,
        text: turn?.querySelector(':scope > [data-slot="markdown-view"]')?.textContent?.length ?? 0,
        status: turn?.querySelector('[role="status"]')?.textContent ?? '',
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  return () =>
    page.evaluate(
      () =>
        (window as unknown as { __turnSamples: { rows: number; text: number; status: string }[] })
          .__turnSamples,
    );
}

async function send(page: Page) {
  await page.goto(`/app/conversations/${CONVERSATION_ID}`);
  await page.getByLabel('Message', { exact: true }).fill('Topologie ?');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
}

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
        body: sse(executionSnapshot(1, 'Bon'), api.current!),
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

test('re-attaching after the server closed keeps the turn on screen, its nodes and a disclosure the person opened', async ({
  page,
}) => {
  await installExecutionApi(page);
  const server = await serveProgressiveRun(page, EXECUTION_ID, snapshotRun(growingRun(4)), {
    intervalMs: 0,
  });
  await send(page);
  await expect.poll(() => server.attaches()).toBe(1);
  await server.advance(2);
  await expect(page.getByText(paragraph(2), { exact: true })).toBeVisible();
  const log = page.locator('[data-slot="execution-work-log"]');
  const reasoning = log.locator('[data-slot="reasoning-step"]').first();
  await expect(reasoning).not.toHaveAttribute('open', '');
  await reasoning.locator(':scope > summary').click();
  await expect(reasoning).toHaveAttribute('open', '');
  const nodes = {
    log: await log.elementHandle(),
    reasoning: await reasoning.elementHandle(),
    tool: await log.getByText('lire_t0', { exact: true }).elementHandle(),
    answer: await page.getByText(paragraph(1), { exact: true }).elementHandle(),
  };
  const samples = await sampleTurn(page);
  await server.close();
  await expect.poll(() => server.attaches()).toBe(2);
  expect(await server.reads()).toBe(1);
  // Let the replay land before the run continues.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await server.advance(3);
  await expect(log.locator(':scope > summary')).toContainText('Travail effectué');
  for (const [name, node] of Object.entries(nodes))
    expect(await node?.evaluate((element) => element.isConnected), name).toBe(true);
  await log.locator(':scope > summary').click();
  await expect(reasoning).toHaveAttribute('open', '');
  const seen = await samples();
  // Neither the rows of the log nor the answer shrank while the replay rebuilt them.
  for (const measure of ['rows', 'text'] as const) {
    const values = seen.map((sample) => sample[measure]);
    expect(
      values.every((value, index) => index === 0 || value >= values[index - 1]!),
      measure,
    ).toBe(true);
  }
  expect(seen.every((sample) => !sample.status.includes('Connexion interrompue'))).toBe(true);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a live run whose observation keeps being closed after progress is never abandoned', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await installExecutionApi(page);
  const commits = 9;
  const server = await serveProgressiveRun(page, EXECUTION_ID, snapshotRun(growingRun(commits)), {
    intervalMs: 60,
    closeAt: Array.from({ length: commits }, (_, index) => index + 1),
  });
  await send(page);
  await expect(page.getByText(paragraph(commits), { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('[data-slot="execution-work-log"] > summary')).toContainText(
    'Travail effectué',
  );
  expect(await server.attaches()).toBeGreaterThan(6);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reconnecter et vérifier l’état' })).toHaveCount(0);
});

test('fruitless re-attaches end with the partial turn and the reconnect affordance, which resumes the run', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await installExecutionApi(page);
  const server = await serveProgressiveRun(page, EXECUTION_ID, snapshotRun(growingRun(4)), {
    intervalMs: 60,
    // The first attach delivers two commits; the next six replay them and close at once.
    closeAt: Array.from({ length: 7 }, () => 2),
  });
  await send(page);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Connexion interrompue', { timeout: 30_000 });
  expect(await server.attaches()).toBe(7);
  await expect(page.getByText(paragraph(2), { exact: true })).toBeVisible();
  await expect(
    page.locator('[data-slot="execution-work-log"] ol[aria-label] > li'),
  ).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Reconnecter et vérifier l’état' }).click();
  await expect(page.getByText(paragraph(4), { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="execution-work-log"] > summary')).toContainText(
    'Travail effectué',
  );
  await expect(alert).toHaveCount(0);
});
