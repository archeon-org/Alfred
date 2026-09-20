import type { ExecutionSnapshot } from '@alfred/contracts';
import type { Page } from '@playwright/test';

import { DISABLED_FEATURE_FLAGS } from '../../../src/services/feature-flags/feature-flags';
import { encodeAgUiFrames, synthesizeRun } from '../../support/ag-ui-synth';
import {
  CONVERSATION_ID,
  defaultSeed,
  installWorkspaceApi,
  type WorkspaceSeed,
} from './workspace-api';

export const EXECUTION_ID = '22222222-2222-4222-8222-222222222222';
export const USER_ID = '21dd1aaa-d564-4a45-9a07-dbc5777d25d5';

export function executionSnapshot(
  revision = 0,
  assistantText = '',
  status: ExecutionSnapshot['execution']['status'] = 'running',
): ExecutionSnapshot {
  return {
    execution: {
      id: EXECUTION_ID,
      conversationId: CONVERSATION_ID,
      status,
      error: null,
      createdAt: '2026-09-11T09:00:00.000Z',
      startedAt: '2026-09-11T09:00:00.000Z',
      finishedAt: null,
    },
    conversation: defaultSeed().conversations[0]!,
    userMessage: 'Diagnostic test',
    assistantText,
    activities: [],
    revision,
    cursor: `cursor:${revision}`,
  };
}

/**
 * One observation response: the AG-UI attach for the first snapshot, then the frames of each
 * later change, exactly as the API translates its committed projection.
 */
export function sse(...snapshots: readonly ExecutionSnapshot[]): string {
  return encodeAgUiFrames(synthesizeRun(snapshots).flat());
}

export async function installExecutionApi(page: Page, seed?: WorkspaceSeed) {
  await installWorkspaceApi(page, seed);
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          accessToken: 'e2e-memory-only-token',
          user: { id: USER_ID, displayName: 'Ada', email: 'ada@example.test', role: 'user' },
        },
      },
    }),
  );
  await page.route('**/api/features', (route) =>
    route.fulfill({
      json: { success: true, data: { ...DISABLED_FEATURE_FLAGS, agentRuntime: true } },
    }),
  );
  await page.route('**/api/conversations/*/messages', (route) =>
    route.fulfill({ json: { success: true, data: { items: [] } } }),
  );
  let current: ExecutionSnapshot | null = null;
  const submissions: unknown[] = [];
  let stops = 0;
  await page.route('**/api/conversations/*/executions', (route) => {
    submissions.push(route.request().postDataJSON());
    current ??= executionSnapshot();
    return route.fulfill({ json: { success: true, data: { snapshot: current } } });
  });
  await page.route('**/api/conversations/*/executions/active', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          snapshot:
            current &&
            !['completed', 'cancelled', 'failed', 'timed_out'].includes(current.execution.status)
              ? current
              : null,
        },
      },
    }),
  );
  await page.route(`**/api/executions/${EXECUTION_ID}`, (route) =>
    route.fulfill({ json: { success: true, data: { snapshot: current } } }),
  );
  await page.route(`**/api/executions/${EXECUTION_ID}/stop`, (route) => {
    stops += 1;
    current = { ...current!, execution: { ...current!.execution, status: 'stopping' } };
    return route.fulfill({ json: { success: true, data: { snapshot: current } } });
  });
  return {
    submissions,
    get current() {
      return current;
    },
    get stops() {
      return stops;
    },
    set(snapshot: ExecutionSnapshot) {
      current = snapshot;
    },
  };
}
