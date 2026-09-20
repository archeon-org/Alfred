import type { EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import {
  assertNoActiveExecutions,
  BUSY_EXECUTION_STATUSES,
  isExecutionBusy,
  isExecutionSettled,
  RECOVERING_GRACE_MS,
  retryDelayMs,
} from '@api/modules/executions/domain/execution-lifecycle';

const now = new Date('2026-09-15T10:00:00Z');
const later = (ms: number) => new Date(now.getTime() + ms);

describe('execution lifecycle helpers', () => {
  it.each([
    [0, 2_000],
    [1, 2_000],
    [2, 4_000],
    [3, 8_000],
    [6, 60_000],
    [40, 60_000],
  ])('backs off claim %i to %i ms without exceeding one minute', (claims, delay) => {
    expect(retryDelayMs(claims)).toBe(delay);
  });

  it('treats terminal rows and parked rows with a confirmed native end as settled', () => {
    expect(isExecutionSettled({ status: 'completed', finishedAt: null })).toBe(true);
    expect(isExecutionSettled({ status: 'recovery_required', finishedAt: new Date() })).toBe(true);
    expect(isExecutionSettled({ status: 'recovery_required', finishedAt: null })).toBe(false);
    expect(isExecutionSettled({ status: 'interrupted', finishedAt: null })).toBe(false);
    expect(isExecutionSettled({ status: 'running', finishedAt: null })).toBe(false);
  });

  it('treats only advancing work within its deadline as busy', () => {
    const row = { finishedAt: null, deadlineAt: later(60_000), updatedAt: now };
    expect(isExecutionBusy({ ...row, status: 'running' }, now)).toBe(true);
    expect(isExecutionBusy({ ...row, status: 'pending' }, now)).toBe(true);
    expect(isExecutionBusy({ ...row, status: 'stopping' }, now)).toBe(true);
    expect(isExecutionBusy({ ...row, status: 'recovering' }, later(1_000))).toBe(true);
    expect(isExecutionBusy({ ...row, status: 'recovering' }, later(RECOVERING_GRACE_MS))).toBe(
      false,
    );
    expect(isExecutionBusy({ ...row, status: 'interrupted' }, now)).toBe(false);
    expect(isExecutionBusy({ ...row, status: 'recovery_required' }, now)).toBe(false);
    expect(isExecutionBusy({ ...row, status: 'running', deadlineAt: now }, now)).toBe(false);
    expect(isExecutionBusy({ ...row, status: 'running', finishedAt: now }, now)).toBe(false);
  });

  it('guards deletion and transfer against busy work only', async () => {
    const query = vi.fn().mockResolvedValue([]);
    await assertNoActiveExecutions({ query } as unknown as EntityManager, ['conversation-1']);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('"deadline_at" > clock_timestamp()'),
      [['conversation-1'], BUSY_EXECUTION_STATUSES, RECOVERING_GRACE_MS],
    );
    expect(query.mock.calls[0]?.[0]).toContain('"finished_at" IS NULL');
    query.mockResolvedValue([{}]);
    await expect(
      assertNoActiveExecutions({ query } as unknown as EntityManager, ['conversation-1']),
    ).rejects.toMatchObject({ code: 'thread_busy' });
  });

  it('skips the query when no conversation is affected', async () => {
    const query = vi.fn();
    await assertNoActiveExecutions({ query } as unknown as EntityManager, []);
    expect(query).not.toHaveBeenCalled();
  });
});
