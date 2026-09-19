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
 * Paces recovery and decides when the browser stops on its own. An attach that delivered progress
 * resets it, so a live run is never abandoned because its observation was closed a few times.
 * Every attach that brought nothing backs off further, while only `RECOVERY_ATTEMPTS` attempts in
 * a row in which neither the recovery read nor the attach showed anything new exhaust it: a run
 * whose reads keep progressing is still followed, slowly, while its stream stays unavailable.
 */
export class RecoveryBudget {
  /** Attaches without progress since the last one that progressed. */
  private stalled = 0;
  /** Attempts in a row in which nothing progressed, the recovery read included. */
  private fruitless = 0;

  /** The backoff step of the next attempt. */
  get attempt(): number {
    return this.stalled;
  }

  progressed(): void {
    this.stalled = 0;
    this.fruitless = 0;
  }

  /**
   * Records an attach that brought nothing; `readProgressed` when the recovery read before it
   * showed what was never shown. False once no attempt remains.
   */
  failed(readProgressed = false): boolean {
    this.stalled += 1;
    this.fruitless = readProgressed ? 0 : this.fruitless + 1;
    return this.fruitless < RECOVERY_ATTEMPTS;
  }
}
