// Each lock acquisition and each auth HTTP operation has its own bounded budget.
export const SESSION_OPERATION_TIMEOUT_MS = 15_000;

export function createSessionTimeout() {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('Session operation timed out.', 'TimeoutError'));
  }, SESSION_OPERATION_TIMEOUT_MS);

  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

export async function withSessionTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const timeout = createSessionTimeout();
  try {
    return await operation(timeout.signal);
  } finally {
    timeout.cancel();
  }
}
