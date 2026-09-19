import type { ExecutionSnapshot } from '@alfred/contracts';
import type { Page } from '@playwright/test';

import { synthesizeFrames } from '../../support/ag-ui-synth';

/** One AG-UI event as the API writes it on the observation stream. */
export interface WireEvent {
  readonly type: string;
}

/** A run as the API serves it to observers that attach at different moments. */
export interface ProgressiveRun {
  /** The committed changes in order: the first batch opens the run, later ones continue it. */
  readonly batches: readonly (readonly WireEvent[])[];
  /** What an attach receives once `position` batches were committed: the re-synthesized run. */
  readonly resync: Readonly<Record<number, readonly WireEvent[]>>;
  /** The JSON read of the execution once `position` batches were committed. */
  readonly reads: Readonly<Record<number, ExecutionSnapshot>>;
  /** After a Stop at `position`: the batches that bring the run to its cancellation. */
  readonly stops?: Readonly<Record<number, readonly (readonly WireEvent[])[]>>;
  /** The JSON read once the run was cancelled at `position`. */
  readonly cancelledReads?: Readonly<Record<number, ExecutionSnapshot>>;
}

export interface DeliveryPlan {
  /** Milliseconds between two batches; 0 delivers only when the test calls `advance`. */
  readonly intervalMs: number;
  /** Positions at which the server closes the attach without a lifecycle end. */
  readonly closeAt?: readonly number[];
  /** Position at which delivery pauses until `resume`. */
  readonly holdAt?: number;
  /** A planned close first writes the transient `error` frame, as a failed server read does. */
  readonly closeWithError?: boolean;
}

export interface ProgressiveServer {
  /** Number of batches committed so far. */
  readonly position: () => Promise<number>;
  readonly attaches: () => Promise<number>;
  readonly reads: () => Promise<number>;
  /** Delivers `count` batches on the open attach (manual plans). */
  readonly advance: (count?: number) => Promise<void>;
  /** Closes the open attach as the server does when it cannot continue it. */
  readonly close: () => Promise<void>;
  readonly resume: () => Promise<void>;
}

const encode = (events: readonly WireEvent[], cursor: string | null) =>
  events
    .map(
      (event, index) =>
        `${index === events.length - 1 && cursor !== null ? `id: ${cursor}\n` : ''}data: ${JSON.stringify(event)}\n\n`,
    )
    .join('');

/** A run described by cumulative public snapshots: every position can be re-attached. */
export function snapshotRun(snapshots: readonly ExecutionSnapshot[]): ProgressiveRun {
  const batches: WireEvent[][] = [];
  const resync: Record<number, WireEvent[]> = {};
  const reads: Record<number, ExecutionSnapshot> = {};
  let previous: ExecutionSnapshot | null = null;
  for (const snapshot of snapshots) {
    batches.push(synthesizeFrames(previous, snapshot).map((frame) => frame.event));
    resync[batches.length] = synthesizeFrames(null, snapshot).map((frame) => frame.event);
    reads[batches.length] = snapshot;
    previous = snapshot;
  }
  return { batches, resync, reads };
}

/**
 * Serves an execution's observation from inside the page, batch by batch over open connections,
 * the way the API does: an attach first receives the re-synthesized run at the current position,
 * then each later batch; a planned close ends the attach without a lifecycle end, and the next
 * attach starts from the re-synthesis. The JSON read and Stop of the execution answer from the
 * same position. Call before navigating.
 */
export async function serveProgressiveRun(
  page: Page,
  executionId: string,
  run: ProgressiveRun,
  plan: DeliveryPlan,
): Promise<ProgressiveServer> {
  const cursorOf = (position: number) => `cursor:${position}`;
  await page.addInitScript(
    (setup) => {
      const encoder = new TextEncoder();
      const state = {
        position: 0,
        attaches: 0,
        reads: 0,
        closes: [...setup.closeAt],
        held: setup.holdAt,
        stopAt: null as number | null,
        push: null as null | ((count: number) => void),
        end: null as null | (() => void),
      };
      const readAt = (position: number) => {
        if (state.stopAt !== null)
          return setup.cancelledReads[state.stopAt] ?? setup.reads[state.stopAt];
        const known = Object.keys(setup.reads)
          .map(Number)
          .filter((key) => key <= position);
        return setup.reads[Math.max(...known)];
      };
      const json = (body: unknown) =>
        new Response(JSON.stringify({ success: true, data: { snapshot: body } }), {
          headers: { 'content-type': 'application/json' },
        });
      const stream = (signal: AbortSignal | null | undefined) => {
        let timer: ReturnType<typeof setInterval> | undefined;
        let open = true;
        let finish: (error?: unknown) => void = () => undefined;
        let push: (count: number) => void = () => undefined;
        const release = () => {
          // Only this attach's controls: a later attach may already own them.
          if (state.push === push) state.push = null;
          if (state.end === finish) state.end = null;
        };
        return new ReadableStream<Uint8Array>({
          start(controller) {
            finish = (error?: unknown) => {
              if (!open) return;
              open = false;
              clearInterval(timer);
              release();
              if (error === undefined) controller.close();
              else controller.error(error);
            };
            const send = (text: string) => {
              if (open) controller.enqueue(encoder.encode(text));
            };
            const step = () => {
              if (state.stopAt !== null) {
                for (const text of setup.stops[state.stopAt] ?? []) send(text);
                finish();
                return;
              }
              if (state.held === state.position) return;
              if (state.closes[0] === state.position) {
                state.closes.shift();
                if (setup.closeWithError) send(setup.errorFrame);
                finish();
                return;
              }
              const batch = setup.batches[state.position];
              if (batch === undefined) {
                finish();
                return;
              }
              state.position += 1;
              send(batch);
              if (state.position === setup.batches.length) finish();
            };
            signal?.addEventListener('abort', () =>
              finish(new DOMException('The operation was aborted.', 'AbortError')),
            );
            push = (count) => {
              for (let sent = 0; sent < count && open; sent += 1) step();
            };
            state.push = push;
            state.end = finish;
            const resync = setup.resync[state.position];
            if (state.position > 0 && resync !== undefined) send(resync);
            if (setup.intervalMs > 0) timer = setInterval(step, setup.intervalMs);
          },
          cancel() {
            // The reader went away: nothing more is committed to this attach.
            open = false;
            clearInterval(timer);
            release();
          },
        });
      };
      Object.assign(window, { __progressiveRun: state });
      const native = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        const path = new URL(url, location.href).pathname;
        if (path === `${setup.base}/events`) {
          state.attaches += 1;
          return Promise.resolve(
            new Response(stream(init?.signal), {
              headers: { 'content-type': 'text/event-stream' },
            }),
          );
        }
        if (path === setup.base && (init?.method ?? 'GET') === 'GET') {
          state.reads += 1;
          return Promise.resolve(json(readAt(state.position)));
        }
        if (path === `${setup.base}/stop`) {
          const current = readAt(state.position)!;
          state.stopAt = state.position;
          return Promise.resolve(
            json({ ...current, execution: { ...current.execution, status: 'stopping' } }),
          );
        }
        return native(input, init);
      };
    },
    {
      base: `/api/executions/${executionId}`,
      intervalMs: plan.intervalMs,
      closeAt: [...(plan.closeAt ?? [])],
      holdAt: plan.holdAt ?? -1,
      closeWithError: plan.closeWithError ?? false,
      // EXECUTION_STREAM_ERROR_EVENT with EXECUTION_STREAM_UNAVAILABLE_CODE, as the API writes it.
      errorFrame: 'event: error\ndata: {"code":"execution_stream_unavailable"}\n\n',
      batches: run.batches.map((batch, index) => encode(batch, cursorOf(index + 1))),
      resync: Object.fromEntries(
        Object.entries(run.resync).map(([position, events]) => [
          position,
          encode(events, cursorOf(Number(position))),
        ]),
      ),
      reads: run.reads,
      stops: Object.fromEntries(
        Object.entries(run.stops ?? {}).map(([position, batches]) => [
          position,
          batches.map((batch, index) => encode(batch, `cursor:stop:${position}:${index}`)),
        ]),
      ),
      cancelledReads: run.cancelledReads ?? {},
    },
  );
  const counters = () =>
    page.evaluate(() => {
      const { position, attaches, reads } = (
        window as unknown as {
          __progressiveRun: { position: number; attaches: number; reads: number };
        }
      ).__progressiveRun;
      return { position, attaches, reads };
    });
  const control = (action: 'advance' | 'close' | 'resume', count = 1) =>
    page.evaluate(
      ({ action, count }) => {
        const state = (
          window as unknown as {
            __progressiveRun: {
              push: ((count: number) => void) | null;
              end: (() => void) | null;
              held: number;
            };
          }
        ).__progressiveRun;
        if (action === 'advance') state.push?.(count);
        else if (action === 'close') state.end?.();
        else state.held = -1;
      },
      { action, count },
    );
  return {
    position: async () => (await counters()).position,
    attaches: async () => (await counters()).attaches,
    reads: async () => (await counters()).reads,
    advance: (count = 1) => control('advance', count),
    close: () => control('close'),
    resume: () => control('resume'),
  };
}
