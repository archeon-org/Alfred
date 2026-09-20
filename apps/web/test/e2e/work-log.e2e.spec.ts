import type { ExecutionSnapshot, ExecutionWork } from '@alfred/contracts';
import { expect, test } from '@playwright/test';

import {
  EXECUTION_ID,
  executionSnapshot,
  installExecutionApi,
  sse,
} from './support/executions-api';
import { preferChat } from './support/chat-preferences';
import { holdEventStream } from './support/held-event-stream';
import { CONVERSATION_ID } from './support/workspace-api';

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

const T0 = Date.parse('2026-09-11T09:00:00.000Z');
const generation = {
  id: 'g0',
  kind: 'generation',
  label: '',
  status: 'completed',
  startedAt: T0 + 500,
  finishedAt: T0 + 900,
} as const;
const marker = {
  id: 'r1',
  kind: 'reasoning',
  label: '',
  status: 'completed',
  startedAt: T0 + 1_000,
  finishedAt: T0 + 6_000,
  text: 'Il faut lister les serveurs.',
} as const;
const narration = {
  id: 'm0',
  kind: 'message',
  label: '',
  status: 'completed',
  startedAt: T0 + 6_000,
  finishedAt: T0 + 7_000,
  text: 'Je vais explorer la **topologie**.',
} as const;
const delegation = {
  id: 'task-1',
  kind: 'delegation',
  label: 'task',
  status: 'running',
  startedAt: T0 + 8_000,
  finishedAt: null,
  specialist: 'topology_agent',
  subagentStatus: 'running',
} as const;
const specialistNarration = {
  id: 'n1',
  kind: 'message',
  label: '',
  status: 'completed',
  startedAt: T0 + 8_500,
  finishedAt: T0 + 8_900,
  text: 'Je commence par le graphe.',
  parentId: 'task-1',
} as const;
const specialistReasoning = {
  id: 'r2',
  kind: 'reasoning',
  label: '',
  status: 'completed',
  startedAt: T0 + 8_100,
  finishedAt: T0 + 8_400,
  text: `Le **graphe** des services suffit. ${'Chaque dépendance est comparée à la version déployée. '.repeat(6)}`,
  parentId: 'task-1',
} as const;
const nested = (id: string, status: 'completed' | 'failed') =>
  ({
    id,
    kind: 'tool',
    label: 'execute_raw',
    status,
    startedAt: T0 + 9_000,
    finishedAt: T0 + 9_400,
    parentId: 'task-1',
  }) as const;
const working: ExecutionWork = {
  steps: [
    generation,
    marker,
    narration,
    delegation,
    specialistReasoning,
    specialistNarration,
    nested('call-1', 'completed'),
    nested('call-2', 'failed'),
  ],
  omittedSteps: 0,
};
const finished: ExecutionWork = {
  steps: [
    generation,
    marker,
    narration,
    { ...delegation, status: 'completed', finishedAt: T0 + 55_000, subagentStatus: 'completed' },
    specialistReasoning,
    specialistNarration,
    nested('call-1', 'completed'),
    nested('call-2', 'failed'),
  ],
  omittedSteps: 0,
};

function withWork(
  revision: number,
  work: ExecutionWork,
  assistantText = '',
  status: ExecutionSnapshot['execution']['status'] = 'running',
): ExecutionSnapshot {
  const base = executionSnapshot(revision, assistantText, status);
  return {
    ...base,
    work,
    execution: {
      ...base.execution,
      finishedAt: status === 'completed' ? '2026-09-11T09:06:34.000Z' : null,
    },
  };
}

test('shows the work behind an answer while it streams, folds it once settled and reopens it after a reload', async ({
  page,
}) => {
  // The whole log, Alfred's and the specialist's steps, shows under the detailed preset.
  await preferChat(page, 'detailed');
  await page.setViewportSize({ width: 1280, height: 900 });
  const api = await installExecutionApi(page);
  const done = withWork(2, finished, 'Voici la carte des dépendances.', 'completed');
  await page.route(`**/api/executions/${EXECUTION_ID}/events`, (route) => {
    api.set(done);
    return route.fulfill({
      contentType: 'text/event-stream',
      body: sse(withWork(1, working), done),
    });
  });
  await page.goto(`/app/conversations/${CONVERSATION_ID}`);
  await page.getByLabel('Message', { exact: true }).fill('Topologie ?');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  // The settled log: folded header with the outcome, the server duration and the counts.
  const log = page.locator('[data-slot="execution-work-log"]');
  await expect(log).toHaveCount(1);
  const header = log.locator(':scope > summary');
  await expect(header).toContainText('Travail effectué');
  await expect(header).toContainText('6 min 34 s');
  await expect(header).toContainText('2 outils');
  await expect(header).toContainText('1 spécialiste');
  await expect(log).not.toHaveAttribute('open', '');
  await header.click();
  await expect(log).toHaveAttribute('open', '');
  const steps = log.getByRole('list', { name: 'Étapes du travail' });
  await expect(steps.getByText('Génération sans réponse').locator('..')).toContainText('0,4 s');
  // Reasoning complete when it appears is folded on a one-line preview of its text.
  const reasoning = steps.locator(':scope > li > [data-slot="reasoning-step"]');
  const reasoningHeader = reasoning.locator(':scope > summary');
  await expect(reasoning).not.toHaveAttribute('open', '');
  await expect(reasoningHeader).toContainText('Réflexion');
  await expect(reasoningHeader).toContainText('5,0 s');
  await expect(reasoningHeader.locator('[data-slot="reasoning-preview"]')).toHaveText(
    'Il faut lister les serveurs.',
  );
  await expect(reasoning.locator('p', { hasText: 'Il faut lister les serveurs.' })).toBeHidden();
  await reasoningHeader.click();
  await expect(reasoning).toHaveAttribute('open', '');
  await expect(reasoning.locator('p', { hasText: 'Il faut lister les serveurs.' })).toBeVisible();
  await expect(reasoningHeader.locator('[data-slot="reasoning-preview"]')).toHaveCount(0);
  await expect(steps.getByText('topologie')).toBeVisible();
  // A specialist done when it appears is folded on a count of its work; it unfolds on demand.
  const specialistRow = steps.locator(':scope > li > [data-slot="specialist-step"]');
  const specialist = specialistRow.locator(':scope > summary');
  await expect(specialist).toContainText('Spécialiste topology_agent');
  await expect(specialist).toContainText('47 s');
  await expect(specialistRow).not.toHaveAttribute('open', '');
  await expect(specialist.locator('[data-slot="specialist-preview"]')).toHaveText('2 outils');
  const specialistLine = (await specialist.boundingBox())!;
  expect(specialistLine.height).toBeLessThan(24);
  await specialist.click();
  await expect(specialistRow).toHaveAttribute('open', '');
  await expect(specialist.locator('[data-slot="specialist-preview"]')).toHaveCount(0);
  const work = steps.getByRole('list', { name: 'Travail de Spécialiste topology_agent' });
  await expect(work.getByText('Je commence par le graphe.')).toBeVisible();
  // A specialist's reasoning folds the same way; its long preview truncates before the duration.
  const thinking = work.locator('[data-slot="reasoning-step"]');
  const thinkingHeader = thinking.locator(':scope > summary');
  await expect(thinking).not.toHaveAttribute('open', '');
  const preview = thinkingHeader.locator('[data-slot="reasoning-preview"]');
  await expect(preview).toContainText('Le graphe des services suffit. Chaque dépendance');
  const line = (await thinkingHeader.boundingBox())!;
  const duration = (await thinkingHeader.getByText('0,3 s', { exact: true }).boundingBox())!;
  expect(line.height).toBeLessThan(24);
  expect(duration.x + duration.width).toBeLessThanOrEqual(line.x + line.width + 1);
  expect(await preview.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await thinkingHeader.click();
  await expect(thinking.getByText('graphe', { exact: true })).toBeVisible();
  // Repeated calls of one tool fold into a single row that unfolds on demand.
  const group = work.locator('details').filter({ hasText: 'execute_raw' });
  await expect(group.locator('summary')).toContainText('×2');
  await expect(group.locator('summary').getByText('échoué')).toHaveCount(1);
  await expect(group).not.toHaveAttribute('open', '');
  await group.locator('summary').click();
  const calls = group.getByRole('list', { name: 'Appels de execute_raw' });
  await expect(calls.getByRole('listitem')).toHaveCount(2);
  await expect(calls.getByText('échoué')).toHaveCount(1);
  await expect(page.getByText('Voici la carte des dépendances.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // After a reload the stored answer carries its account and loads its steps on demand.
  const stored = (role: 'user' | 'assistant', content: string, id: string) => ({
    id,
    conversationId: CONVERSATION_ID,
    executionId: EXECUTION_ID,
    role,
    content,
    createdAt: '2026-09-11T09:00:01.000Z',
    ...(role === 'assistant'
      ? {
          work: {
            status: 'completed',
            durationMs: 394_000,
            steps: 8,
            tools: 2,
            delegations: 1,
            failedSteps: 1,
          },
        }
      : {}),
  });
  await page.route('**/api/conversations/*/messages', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          items: [
            stored('user', 'Topologie ?', '33333333-3333-4333-8333-333333333331'),
            stored(
              'assistant',
              'Voici la carte des dépendances.',
              '33333333-3333-4333-8333-333333333332',
            ),
          ],
        },
      },
    }),
  );
  let reads = 0;
  await page.route(`**/api/executions/${EXECUTION_ID}`, (route) => {
    reads += 1;
    return route.fulfill({ json: { success: true, data: { snapshot: done } } });
  });
  await page.reload();
  const storedLog = page.locator('[data-slot="execution-work-log"]');
  await expect(storedLog).toHaveCount(1);
  await expect(storedLog.locator(':scope > summary')).toContainText('Travail effectué');
  await expect(storedLog.locator(':scope > summary')).toContainText('6 min 34 s');
  await expect(storedLog).not.toHaveAttribute('open', '');
  expect(reads).toBe(0);
  await storedLog.locator(':scope > summary').click();
  await expect(storedLog.getByRole('list', { name: 'Étapes du travail' })).toBeVisible();
  await expect(storedLog.getByText('Spécialiste topology_agent')).toBeVisible();
  await expect(storedLog.locator('[data-slot="specialist-step"]')).not.toHaveAttribute('open', '');
  await expect(storedLog.locator('[data-slot="reasoning-step"]')).toHaveCount(2);
  for (const row of await storedLog.locator('[data-slot="reasoning-step"]').all())
    await expect(row).not.toHaveAttribute('open', '');
  expect(reads).toBe(1);
});

test('streams reasoning in the open, folds it once complete and keeps a row the person toggled', async ({
  page,
}) => {
  // Reasoning streams in the open in the detailed chat mode (Paramètres › Chat).
  await preferChat(page, 'detailed');
  await page.setViewportSize({ width: 1280, height: 900 });
  const api = await installExecutionApi(page);
  const thinking = (status: 'running' | 'completed'): ExecutionWork => ({
    steps: [
      { ...marker, status, finishedAt: status === 'running' ? null : marker.finishedAt },
      {
        id: 'r3',
        kind: 'reasoning',
        label: '',
        status,
        startedAt: T0 + 6_000,
        finishedAt: status === 'running' ? null : T0 + 7_000,
        text: 'Une autre **piste** : les files de messages.',
      },
    ],
    omittedSteps: 0,
  });
  const done = withWork(2, thinking('completed'), 'Voici les deux pistes.', 'completed');
  const stream = await holdEventStream(page, EXECUTION_ID, [
    withWork(1, thinking('running')),
    done,
  ]);
  await page.goto(`/app/conversations/${CONVERSATION_ID}`);
  await page.getByLabel('Message', { exact: true }).fill('Des pistes ?');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();

  // While running, each reasoning is open and its text readable; no preview competes with it.
  const rows = page.locator('[data-slot="reasoning-step"]');
  await expect(rows).toHaveCount(2);
  const [untouched, toggled] = [rows.nth(0), rows.nth(1)];
  for (const row of [untouched, toggled]) {
    await expect(row).toHaveAttribute('open', '');
    await expect(row.locator(':scope > summary')).toContainText('en cours…');
    await expect(row.locator('[data-slot="reasoning-preview"]')).toHaveCount(0);
  }
  await expect(untouched.getByText('Il faut lister les serveurs.')).toBeVisible();
  // The person folds the second one, then opens it again: their choice outlives the run.
  await toggled.locator(':scope > summary').click();
  await expect(toggled).not.toHaveAttribute('open', '');
  await expect(toggled.locator('[data-slot="reasoning-preview"]')).toHaveText(
    'Une autre piste : les files de messages.',
  );
  await toggled.locator(':scope > summary').click();
  await expect(toggled).toHaveAttribute('open', '');

  api.set(done);
  await stream.next();
  await expect(page.getByText('Voici les deux pistes.')).toBeVisible();
  await expect(untouched).not.toHaveAttribute('open', '');
  await expect(untouched.locator('[data-slot="reasoning-preview"]')).toHaveText(
    'Il faut lister les serveurs.',
  );
  await expect(untouched.locator(':scope > summary')).toContainText('5,0 s');
  await expect(toggled).toHaveAttribute('open', '');
  // The settled log folds as a whole; reopened, it shows each row as the run left it.
  const log = page.locator('[data-slot="execution-work-log"]');
  await expect(log).not.toHaveAttribute('open', '');
  await log.locator(':scope > summary').click();
  await expect(toggled.getByText('piste', { exact: true })).toBeVisible();
  await expect(untouched.locator('[data-slot="reasoning-preview"]')).toBeVisible();
  await expect(untouched.getByText('Il faut lister les serveurs.', { exact: true })).toHaveCount(2);
});

test('keeps a working specialist open, folds it once done and keeps a specialist the person unfolded', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const api = await installExecutionApi(page);
  const delegate = (id: string, specialist: string, status: 'running' | 'completed') =>
    ({
      id,
      kind: 'delegation',
      label: 'task',
      status,
      startedAt: T0 + 8_000,
      finishedAt: status === 'running' ? null : T0 + 20_000,
      specialist,
      subagentStatus: status,
    }) as const;
  const call = (id: string, parentId: string) =>
    ({
      id,
      kind: 'tool',
      label: id.startsWith('graph') ? 'execute_raw' : 'search_documents',
      status: 'completed',
      startedAt: T0 + 9_000,
      finishedAt: T0 + 9_400,
      parentId,
    }) as const;
  const specialists = (status: 'running' | 'completed'): ExecutionWork => ({
    steps: [
      delegate('task-1', 'topology_agent', status),
      call('graph-1', 'task-1'),
      delegate('task-2', 'knowledge_agent', status),
      call('docs-1', 'task-2'),
      call('docs-2', 'task-2'),
    ],
    omittedSteps: 0,
  });
  const done = withWork(2, specialists('completed'), 'Voici la synthèse.', 'completed');
  const stream = await holdEventStream(page, EXECUTION_ID, [
    withWork(1, specialists('running')),
    done,
  ]);
  await page.goto(`/app/conversations/${CONVERSATION_ID}`);
  await page.getByLabel('Message', { exact: true }).fill('Topologie et documentation ?');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();

  // While they work, both specialists are open with their own work readable beneath them.
  const rows = page.locator('[data-slot="specialist-step"]');
  await expect(rows).toHaveCount(2);
  const [untouched, toggled] = [rows.nth(0), rows.nth(1)];
  for (const row of [untouched, toggled]) {
    await expect(row).toHaveAttribute('open', '');
    await expect(row.locator(':scope > summary')).toContainText('en cours…');
    await expect(row.locator('[data-slot="specialist-preview"]')).toHaveCount(0);
  }
  await expect(untouched.getByText('execute_raw')).toBeVisible();
  // The person folds the second one, then unfolds it: their choice outlives the run.
  await toggled.locator(':scope > summary').click();
  await expect(toggled).not.toHaveAttribute('open', '');
  await expect(toggled.locator('[data-slot="specialist-preview"]')).toHaveText('2 outils');
  await expect(toggled.locator(':scope > ol')).toBeHidden();
  await toggled.locator(':scope > summary').press('Enter');
  await expect(toggled).toHaveAttribute('open', '');

  api.set(done);
  await stream.next();
  await expect(page.getByText('Voici la synthèse.')).toBeVisible();
  const log = page.locator('[data-slot="execution-work-log"]');
  await expect(log).not.toHaveAttribute('open', '');
  await log.locator(':scope > summary').click();
  await expect(untouched).not.toHaveAttribute('open', '');
  await expect(untouched.locator('[data-slot="specialist-preview"]')).toHaveText('1 outil');
  await expect(untouched.locator(':scope > summary')).toContainText('12 s');
  await expect(toggled).toHaveAttribute('open', '');
  await expect(toggled.locator(':scope > ol')).toBeVisible();
  await expect(toggled.locator(':scope > ol')).toContainText('search_documents×2');
});
