import type { ExecutionSnapshot, ExecutionWork } from '@alfred/contracts';
import { expect, test } from '@playwright/test';

import { EXECUTION_ID, executionSnapshot, installExecutionApi } from './support/executions-api';
import { holdEventStream } from './support/held-event-stream';
import { CONVERSATION_ID } from './support/workspace-api';

const T0 = Date.parse('2026-09-11T09:00:00.000Z');

function withWork(
  revision: number,
  status: 'running' | 'completed',
  assistantText = '',
): ExecutionSnapshot {
  const done = status === 'completed';
  const work: ExecutionWork = {
    steps: [
      {
        id: 'r1',
        kind: 'reasoning',
        label: '',
        status: 'completed',
        startedAt: T0 + 500,
        finishedAt: T0 + 2_000,
        text: 'Il faut interroger le graphe.',
      },
      {
        id: 'task-1',
        kind: 'delegation',
        label: 'task',
        status,
        startedAt: T0 + 2_000,
        finishedAt: done ? T0 + 9_000 : null,
        specialist: 'topology_agent',
        subagentStatus: status,
      },
      {
        id: 'call-1',
        kind: 'tool',
        label: 'execute_raw',
        status,
        startedAt: T0 + 3_000,
        finishedAt: done ? T0 + 4_000 : null,
        parentId: 'task-1',
      },
    ],
    omittedSteps: 0,
  };
  const base = executionSnapshot(revision, assistantText, status);
  return {
    ...base,
    work,
    execution: { ...base.execution, finishedAt: done ? '2026-09-11T09:00:09.000Z' : null },
  };
}

test('the simple preset sets its switches, and a specialist setting changed on top is kept', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const api = await installExecutionApi(page);
  const done = withWork(2, 'completed', 'Voici la topologie.');
  const stream = await holdEventStream(page, EXECUTION_ID, [withWork(1, 'running'), done]);

  await page.goto('/app/settings?section=chat');
  await expect(page.getByRole('heading', { level: 1, name: 'Chat' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Chat', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('radio', { name: 'Standard' })).toBeChecked();
  // Choosing a preset visibly sets its switches.
  await page.getByRole('radio', { name: 'Simple' }).check();
  await expect(page.getByRole('switch', { name: 'Réflexions d’Alfred' })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: 'Outils des spécialistes' })).not.toBeChecked();
  // Changing one switch on top of it turns the preset into a custom combination.
  await page.getByRole('switch', { name: 'Outils des spécialistes' }).click();
  await expect(page.getByRole('radio', { name: 'Personnalisé' })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Outils des spécialistes' })).toBeChecked();

  await page.goto(`/app/conversations/${CONVERSATION_ID}`);
  await page.getByLabel('Message', { exact: true }).fill('Topologie ?');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();

  // While Alfred works: one folded line naming what happens now.
  const log = page.locator('[data-slot="execution-work-log"]');
  const header = log.locator(':scope > summary');
  await expect(header).toContainText('Travail en cours');
  await expect(header.locator('[data-slot="work-activity"]')).toHaveText(
    '· topology_agent · execute_raw',
  );
  await expect(log).not.toHaveAttribute('open', '');

  // Unfolded: the specialist with its tools, as chosen, and no reasoning.
  await header.click();
  await expect(log).toHaveAttribute('open', '');
  const steps = log.getByRole('list', { name: 'Étapes du travail' });
  const specialist = steps.locator('[data-slot="specialist-step"]');
  await expect(specialist).toHaveAttribute('open', '');
  await expect(specialist.getByText('execute_raw')).toBeVisible();
  await expect(log.locator('[data-slot="reasoning-step"]')).toHaveCount(0);
  await header.click();

  api.set(done);
  await stream.next();
  await expect(page.getByText('Voici la topologie.')).toBeVisible();
  await expect(header).toContainText('Travail effectué');
  await expect(header).toContainText('1 outil');
  await expect(log).not.toHaveAttribute('open', '');
});
