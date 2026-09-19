import type { ExecutionSnapshot, ExecutionWork } from '@alfred/contracts';
import type { Page } from '@playwright/test';

import { EXECUTION_ID, executionSnapshot } from './executions-api';
import { holdEventStream } from './held-event-stream';

const STARTED = '2026-09-12T09:00:00.000Z';
const T0 = Date.parse(STARTED);

/** A turn created after the stored history, so it is placed at the end of the transcript. */
function laterTurn(
  revision: number,
  answer: string,
  work: ExecutionWork,
  status: ExecutionSnapshot['execution']['status'] = 'running',
): ExecutionSnapshot {
  const base = executionSnapshot(revision, answer, status);
  return {
    ...base,
    work,
    execution: {
      ...base.execution,
      createdAt: STARTED,
      startedAt: STARTED,
      finishedAt: status === 'completed' ? '2026-09-12T09:01:00.000Z' : null,
    },
  };
}

function reasoning(status: 'running' | 'completed', lines: number): ExecutionWork {
  const text = Array.from(
    { length: lines },
    (_, line) => `Ligne ${line + 1} de la réflexion sur la suite à donner.`,
  ).join('\n\n');
  return {
    steps: [
      {
        id: 'reasoning-1',
        kind: 'reasoning',
        label: '',
        status,
        startedAt: T0 + 1_000,
        finishedAt: status === 'running' ? null : T0 + 6_000,
        ...(lines > 0 ? { text } : {}),
      },
    ],
    omittedSteps: 0,
  };
}

/**
 * Answers the next message with a live turn served one snapshot at a time: a reasoning marker,
 * then its text growing `reasoningSteps` times, its completion (the row folds), then the answer
 * growing `answerSteps` paragraphs, then the settled answer. Call before navigating.
 */
export async function installStreamedTurn(
  page: Page,
  { reasoningSteps = 5, answerSteps = 6 }: { reasoningSteps?: number; answerSteps?: number } = {},
) {
  const lines = reasoningSteps * 4;
  const answer = (paragraphs: number) =>
    Array.from(
      { length: paragraphs },
      (_, index) => `Paragraphe ${index + 1} de la réponse. ${'Du texte diffusé. '.repeat(18)}`,
    ).join('\n\n');
  const snapshots = [
    laterTurn(1, '', reasoning('running', 0)),
    ...Array.from({ length: reasoningSteps }, (_, step) =>
      laterTurn(2 + step, '', reasoning('running', (step + 1) * 4)),
    ),
    laterTurn(2 + reasoningSteps, '', reasoning('completed', lines)),
    ...Array.from({ length: answerSteps }, (_, step) =>
      laterTurn(3 + reasoningSteps + step, answer(step + 1), reasoning('completed', lines)),
    ),
  ];
  const done = laterTurn(
    3 + reasoningSteps + answerSteps,
    answer(answerSteps),
    reasoning('completed', lines),
    'completed',
  );
  await page.route('**/api/conversations/*/executions', (route) =>
    route.fulfill({ json: { success: true, data: { snapshot: snapshots[0] } } }),
  );
  await page.route('**/api/conversations/*/executions/active', (route) =>
    route.fulfill({ json: { success: true, data: { snapshot: null } } }),
  );
  await page.route(`**/api/executions/${EXECUTION_ID}`, (route) =>
    route.fulfill({ json: { success: true, data: { snapshot: done } } }),
  );
  const stream = await holdEventStream(page, EXECUTION_ID, [...snapshots, done]);
  return {
    stream,
    reasoningSteps,
    answerSteps,
    lastParagraph: `Paragraphe ${answerSteps} de la réponse.`,
  };
}
