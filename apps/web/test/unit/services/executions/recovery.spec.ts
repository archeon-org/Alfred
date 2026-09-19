import { AGUIError } from '@ag-ui/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isRetryable,
  reattachDelay,
  RECOVERY_ATTEMPTS,
  RecoveryBudget,
  recoveryDelay,
} from '@/services/executions/recovery';
import { InvalidStreamError } from '@/services/executions/sse';
import { ApiRequestError } from '@/services/http/api-json';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('bounded observer recovery', () => {
  it('uses increasing jittered delays capped at eight seconds before jitter', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    for (const [attempt, delay] of [
      [0, 250],
      [1, 500],
      [8, 8000],
    ] as const) {
      const resolve = vi.fn();
      const pending = recoveryDelay(attempt, new AbortController().signal).then(resolve);
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(resolve).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(resolve).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it.each([true, false])(
    'releases its timer when observation is already aborted=%s',
    async (already) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      if (already) controller.abort();
      const pending = recoveryDelay(4, controller.signal);
      const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      if (!already) controller.abort();
      await rejection;
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('re-attaches after progress within a short jittered pause', async () => {
    vi.useFakeTimers();
    for (const [random, delay] of [
      [0, 100],
      [1, 300],
    ] as const) {
      vi.spyOn(Math, 'random').mockReturnValue(random);
      const resolve = vi.fn();
      const pending = reattachDelay(new AbortController().signal).then(resolve);
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(resolve).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(resolve).toHaveBeenCalledOnce();
    }
  });

  it('counts only consecutive fruitless attempts toward the budget', () => {
    const budget = new RecoveryBudget();
    for (let attempt = 1; attempt < RECOVERY_ATTEMPTS; attempt += 1) {
      expect(budget.failed()).toBe(true);
      expect(budget.attempt).toBe(attempt);
    }
    budget.progressed();
    expect(budget.attempt).toBe(0);
    for (let attempt = 1; attempt < RECOVERY_ATTEMPTS; attempt += 1)
      expect(budget.failed()).toBe(true);
    expect(budget.failed()).toBe(false);
  });

  it('retries transient availability failures but fails closed on authorization and malformed data', () => {
    expect(isRetryable(new TypeError('offline'))).toBe(true);
    expect(isRetryable(new ApiRequestError(429, 'limited', 'Wait'))).toBe(true);
    expect(isRetryable(new ApiRequestError(503, 'unavailable', 'Wait'))).toBe(true);
    for (const status of [400, 401, 403, 404, 409, 410]) {
      expect(isRetryable(new ApiRequestError(status, 'rejected', 'Rejected'))).toBe(false);
    }
    expect(isRetryable(new InvalidStreamError())).toBe(false);
    // Protocol violations reported by the official AG-UI verifier never reconnect.
    expect(isRetryable(new AGUIError('Cannot send TEXT_MESSAGE_CONTENT'))).toBe(false);
  });
});
