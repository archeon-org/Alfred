import { createServer, type Server } from 'node:http';

import { expect, test } from '@playwright/test';

import { EXECUTION_ID, installExecutionApi } from './support/executions-api';
import type { ProgressiveRun, WireEvent } from './support/progressive-run';
import { loadRecordedRun, recordFindings, RECORDED_RUN_PATH } from './support/recorded-run';
import { CONVERSATION_ID } from './support/workspace-api';

/**
 * The recorded run served over a real connection through the Vite development proxy, as the API
 * serves it in development: the observation is closed cleanly, then with the transient error
 * frame, an attach is refused with 503 and the connection is finally reset. Console findings are
 * printed verbatim. Needs a recording and a dev server started with
 * `ALFRED_DEV_API_PROXY_TARGET=http://127.0.0.1:<ALFRED_RECORDED_PROXY_PORT>`. Every browser
 * project needs that one port, so their runs take it in turn instead of failing with `EADDRINUSE`.
 */
const PROXY_PORT = Number(process.env.ALFRED_RECORDED_PROXY_PORT ?? '0');
test.skip(RECORDED_RUN_PATH === undefined || PROXY_PORT === 0, 'recording or proxy port missing');

const INTERVAL_MS = 20;
/** One run takes up to its own budget; the other projects may each hold the port that long. */
const RUN_MS = 180_000;
const PORT_WAIT_MS = 2 * RUN_MS;

/** Binds the shared proxy port, waiting while another browser project's run holds it. */
async function listenInTurn(server: Server, port: number): Promise<void> {
  const deadline = Date.now() + PORT_WAIT_MS;
  for (;;) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.off('error', reject);
          resolve();
        });
      });
      return;
    } catch (error) {
      const busy = (error as NodeJS.ErrnoException).code === 'EADDRINUSE';
      if (!busy || Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
type Close = 'end' | 'error' | 'reset';

const encode = (events: readonly WireEvent[], cursor: string) =>
  events
    .map(
      (event, index) =>
        `${index === events.length - 1 ? `id: ${cursor}\n` : ''}data: ${JSON.stringify(event)}\n\n`,
    )
    .join('');

function serveOverNetwork(run: ProgressiveRun, closes: [number, Close][], refused: number[]) {
  const started = Date.now();
  const state = { position: 0, attaches: 0, log: [] as string[] };
  const server: Server = createServer((request, response) => {
    if (request.url?.endsWith('/events') !== true) {
      response.writeHead(404).end();
      return;
    }
    state.attaches += 1;
    state.log.push(`attach ${state.attaches} at ${Date.now() - started} ms from ${state.position}`);
    if (refused.includes(state.attaches)) {
      response.writeHead(503, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          success: false,
          error: { code: 'execution_stream_unavailable', message: 'Unavailable' },
        }),
      );
      return;
    }
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    const replay = run.resync[state.position];
    if (state.position > 0 && replay !== undefined)
      response.write(encode(replay, `cursor:${state.position}`));
    const timer = setInterval(() => {
      const close = closes[0];
      if (close !== undefined && close[0] === state.position) {
        closes.shift();
        clearInterval(timer);
        state.log.push(`${close[1]} at ${Date.now() - started} ms on ${state.position}`);
        if (close[1] === 'reset') response.socket?.destroy();
        else
          response.end(
            close[1] === 'error'
              ? 'event: error\ndata: {"code":"execution_stream_unavailable"}\n\n'
              : undefined,
          );
        return;
      }
      const batch = run.batches[state.position];
      if (batch === undefined) {
        clearInterval(timer);
        response.end();
        return;
      }
      state.position += 1;
      response.write(encode(batch, `cursor:${state.position}`));
    }, INTERVAL_MS);
    response.on('close', () => clearInterval(timer));
  });
  return { server, state };
}

test('a recorded run survives closes, a refused attach and a reset through the dev proxy', async ({
  page,
  browserName,
}) => {
  test.setTimeout(RUN_MS + PORT_WAIT_MS);
  const run = loadRecordedRun(RECORDED_RUN_PATH!);
  const { server, state } = serveOverNetwork(
    run,
    [
      [200, 'end'],
      [400, 'error'],
      [600, 'reset'],
    ],
    [3],
  );
  await listenInTurn(server, PROXY_PORT);
  const findings = recordFindings(page);
  try {
    await installExecutionApi(page);
    await page.route(`**/api/executions/${EXECUTION_ID}`, (route) => {
      const known = Object.keys(run.reads)
        .map(Number)
        .filter((position) => position <= state.position);
      return route.fulfill({
        json: { success: true, data: { snapshot: run.reads[Math.max(...known)] } },
      });
    });
    await page.goto(`/app/conversations/${CONVERSATION_ID}`);
    await page.getByLabel('Message', { exact: true }).fill('Topologie');
    await page.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect(page.getByText('Travail effectué', { exact: false }).first()).toBeVisible({
      timeout: 150_000,
    });
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    console.log(`[network] ${browserName} ${JSON.stringify({ attaches: state.log, findings })}`);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
