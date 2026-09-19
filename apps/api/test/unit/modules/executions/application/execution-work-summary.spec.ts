import type { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import { loadWorkSummaries } from '@api/modules/executions/application/execution-work-summary';

describe('work summaries of stored answers', () => {
  it('asks nothing when no assistant row names an execution', async () => {
    const query = vi.fn();
    await expect(loadWorkSummaries({ query } as unknown as DataSource, [])).resolves.toEqual(
      new Map(),
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('counts the work inside the database and maps rows to the public summary', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        id: 'e1',
        status: 'completed',
        startedAt: new Date('2026-09-16T10:00:00.000Z'),
        finishedAt: new Date('2026-09-16T10:06:34.000Z'),
        steps: '14',
        tools: 12,
        delegations: '3',
        failedSteps: null,
      },
      {
        id: 'e2',
        status: 'not-a-status',
        startedAt: null,
        finishedAt: null,
        steps: 0,
        tools: 0,
        delegations: 0,
        failedSteps: 0,
      },
      {
        id: 'e3',
        status: 'cancelled',
        startedAt: null,
        finishedAt: '2026-09-16T10:00:01.000Z',
        steps: 2,
        tools: 1,
        delegations: 0,
        failedSteps: 1,
      },
    ]);
    const summaries = await loadWorkSummaries({ query } as unknown as DataSource, [
      'e1',
      'e1',
      'e2',
      'e3',
    ]);
    expect(query).toHaveBeenCalledOnce();
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('jsonb_each');
    expect(sql).not.toContain("reducer_state\"->'texts'");
    expect(parameters).toEqual([['e1', 'e2', 'e3']]);
    expect(summaries.get('e1')).toEqual({
      status: 'completed',
      durationMs: 394_000,
      steps: 14,
      tools: 12,
      delegations: 3,
      failedSteps: 0,
    });
    expect(summaries.has('e2')).toBe(false);
    expect(summaries.get('e3')).toMatchObject({
      status: 'cancelled',
      durationMs: null,
      failedSteps: 1,
    });
  });
});
