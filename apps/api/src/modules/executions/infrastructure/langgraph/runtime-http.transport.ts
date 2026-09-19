import { RuntimeClientError } from '../../application/runtime-client.port';

export const RUNTIME_REQUEST_TIMEOUT_MS = 30_000;
export const RUNTIME_STREAM_IDLE_MS = 90_000;
const MAX_JSON_BYTES = 65_536;
const SAFE_ERROR_STATUS = new Map<number, string>([
  [401, 'runtime_unauthorized'],
  [403, 'runtime_execution_forbidden'],
  [404, 'runtime_replay_expired'],
  [409, 'runtime_invocation_conflict'],
  [410, 'runtime_replay_expired'],
  [429, 'runtime_stream_limit'],
]);

/** A renewable idle budget plus the worker's independent lifetime/lease cancellation. */
export class RuntimeRequestBudget {
  private readonly controller = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly cancel = () =>
    this.controller.abort(new RuntimeClientError('runtime_request_cancelled'));

  constructor(private readonly parent: AbortSignal) {
    parent.addEventListener('abort', this.cancel, { once: true });
    if (parent.aborted) this.cancel();
    this.arm(RUNTIME_REQUEST_TIMEOUT_MS, 'runtime_request_timeout');
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  arm(milliseconds: number, code: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => this.controller.abort(new RuntimeClientError(code)),
      milliseconds,
    );
    this.timer.unref?.();
  }

  assertActive(): void {
    if (this.signal.aborted) throw this.signal.reason as RuntimeClientError;
  }

  close(): void {
    clearTimeout(this.timer);
    this.parent.removeEventListener('abort', this.cancel);
  }

  safeError(error: unknown): RuntimeClientError {
    if (this.signal.aborted) return this.signal.reason as RuntimeClientError;
    return error instanceof RuntimeClientError
      ? error
      : new RuntimeClientError('runtime_unavailable');
  }
}

/** Reader cancellation is explicit: it also handles streams that ignore fetch's abort signal. */
export async function readRuntimeChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  budget: RuntimeRequestBudget,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  budget.assertActive();
  let cancel: (() => void) | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        cancel = () => {
          // The request error remains authoritative if cancellation itself cannot reach the peer.
          void reader.cancel().catch(() => undefined);
          reject(budget.signal.reason as RuntimeClientError);
        };
        budget.signal.addEventListener('abort', cancel, { once: true });
        if (budget.signal.aborted) cancel();
      }),
    ]);
  } finally {
    if (cancel) budget.signal.removeEventListener('abort', cancel);
    budget.assertActive();
  }
}

export async function readRuntimeJson(
  response: Response,
  budget: RuntimeRequestBudget,
): Promise<unknown> {
  if (
    response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  ) {
    void response.body?.cancel().catch(() => undefined);
    throw new RuntimeClientError('runtime_response_invalid');
  }
  if (!response.body) throw new RuntimeClientError('runtime_response_invalid');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await readRuntimeChunk(reader, budget);
      if (part.done) break;
      length += part.value.byteLength;
      if (length > MAX_JSON_BYTES) throw new RuntimeClientError('runtime_response_limit');
      if (part.value.byteLength > 0) chunks.push(part.value);
    }
    try {
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
      ) as unknown;
    } catch {
      throw new RuntimeClientError('runtime_response_invalid');
    }
  } finally {
    // Cleanup is best effort; its promise is not allowed to outlive the request budget.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function assertRuntimeSuccess(response: Response): void {
  if (response.ok) return;
  void response.body?.cancel().catch(() => undefined);
  // Native errors are not Product errors. Never copy their body, details, or arbitrary codes.
  throw new RuntimeClientError(SAFE_ERROR_STATUS.get(response.status) ?? 'runtime_unavailable');
}
