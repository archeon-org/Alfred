import { AGUIError } from '@ag-ui/core';

import { ApiRequestError } from '@/services/http/api-json';
import { InvalidStreamError } from '@/services/executions/sse';

/** Consecutive attempts that brought nothing before the browser stops reconnecting on its own. */
export const RECOVERY_ATTEMPTS = 6;

/** Invalid frames and AG-UI protocol violations fail closed; only transport faults reconnect. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof InvalidStreamError || error instanceof AGUIError) return false;
  if (error instanceof ApiRequestError) return error.status === 429 || error.status >= 500;
  return true;
}

function wait(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(new DOMException('Observation closed', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, delay);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

/** Bounded exponential backoff with jitter, cancelled when this browser observer disappears. */
export function recoveryDelay(attempt: number, signal: AbortSignal): Promise<void> {
  const base = Math.min(8_000, 250 * 2 ** attempt);
  return wait(base * (0.75 + Math.random() * 0.5), signal);
}

/**
 * The short, jittered pause before re-attaching to a run whose last attach was still delivering
 * progress when the server closed it: the observation continues instead of backing off.
 */
export function reattachDelay(signal: AbortSignal): Promise<void> {
  return wait(100 + Math.random() * 200, signal);
}

/**
 * Counts consecutive attempts that brought nothing. An attach that delivered progress resets it,
 * so a live run is never abandoned because its observation was closed a few times; only
 * `RECOVERY_ATTEMPTS` fruitless attempts in a row exhaust it.
 */
export class RecoveryBudget {
  private failures = 0;

  /** Fruitless attempts since the last progress: the backoff step of the next one. */
  get attempt(): number {
    return this.failures;
  }

  progressed(): void {
    this.failures = 0;
  }

  /** Records a fruitless attempt; false once no attempt remains. */
  failed(): boolean {
    this.failures += 1;
    return this.failures < RECOVERY_ATTEMPTS;
  }
}
