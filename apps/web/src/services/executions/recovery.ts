import { AGUIError } from '@ag-ui/core';

import { ApiRequestError } from '@/services/http/api-json';
import { InvalidStreamError } from '@/services/executions/sse';

export const RECOVERY_ATTEMPTS = 6;

/** Invalid frames and AG-UI protocol violations fail closed; only transport faults reconnect. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof InvalidStreamError || error instanceof AGUIError) return false;
  if (error instanceof ApiRequestError) return error.status === 429 || error.status >= 500;
  return true;
}

/** Bounded exponential backoff with jitter, cancelled when this browser observer disappears. */
export function recoveryDelay(attempt: number, signal: AbortSignal): Promise<void> {
  const base = Math.min(8_000, 250 * 2 ** attempt);
  const delay = base * (0.75 + Math.random() * 0.5);
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
