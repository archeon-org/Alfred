import type { ExecutionSnapshot } from '@alfred/contracts';
import type { Page } from '@playwright/test';

import { encodeAgUiFrames, synthesizeRun } from '../../support/ag-ui-synth';

/**
 * Serves the observation stream of an execution from inside the page, one snapshot at a time over
 * a single open connection, so a test can look at the transcript between two changes (a mocked
 * route can only answer with the whole body at once). Call before navigating; `next()` sends the
 * frames of the following snapshot and closes the stream after the last one; `next(n)` sends the
 * frames of the `n` following snapshots back to back, in a single task.
 */
export async function holdEventStream(
  page: Page,
  executionId: string,
  snapshots: readonly ExecutionSnapshot[],
): Promise<{ next: (count?: number) => Promise<void> }> {
  const chunks = synthesizeRun(snapshots).map((frames) => encodeAgUiFrames(frames));
  await page.addInitScript(
    ({ path, parts }) => {
      const encoder = new TextEncoder();
      const queue = [...parts];
      let push: (() => void) | undefined;
      const native = window.fetch.bind(window);
      Object.assign(window, { nextEventChunk: () => push?.() });
      window.fetch = (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        if (!new URL(url, location.href).pathname.endsWith(path)) return native(input, init);
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            push = () => {
              const part = queue.shift();
              if (part !== undefined) controller.enqueue(encoder.encode(part));
              if (queue.length === 0) controller.close();
            };
            push();
          },
        });
        return Promise.resolve(
          new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
        );
      };
    },
    { path: `/api/executions/${executionId}/events`, parts: chunks },
  );
  return {
    next: (count = 1) =>
      page.evaluate((times) => {
        const { nextEventChunk } = window as unknown as { nextEventChunk: () => void };
        for (let sent = 0; sent < times; sent += 1) nextEventChunk();
      }, count),
  };
}
