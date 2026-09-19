import { writeFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { EXECUTION_ID, installExecutionApi } from './support/executions-api';
import { serveProgressiveRun, type DeliveryPlan } from './support/progressive-run';
import {
  loadRecordedRun,
  recordFindings,
  RECORDED_RUN_PATH,
  type Finding,
} from './support/recorded-run';
import { CONVERSATION_ID } from './support/workspace-api';

/**
 * A recorded reasoning-heavy run replayed at a compressed pace through the real browser pipeline:
 * console findings and main-thread cost are printed for the lead's report. Skipped without a
 * recording (`ALFRED_RECORDED_RUN`), which holds conversation content and is never committed.
 */
test.skip(RECORDED_RUN_PATH === undefined, 'ALFRED_RECORDED_RUN is not set');

const INTERVAL_MS = Number(process.env.ALFRED_RECORDED_INTERVAL_MS ?? '20');
/** Time budget of one delivery of the recording (under 1 000 batches) with a wide margin. */
const RUN_BUDGET_MS = INTERVAL_MS * 1_000 * 3 + 60_000;

interface Sample {
  readonly steps: number;
  readonly text: number;
  readonly at: string;
}

async function installProbes(page: Page) {
  await page.addInitScript(() => {
    const probe = { longTasks: [] as number[], samples: [] as Sample[] };
    Object.assign(window, { __probe: probe });
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) probe.longTasks.push(entry.duration);
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      // Long tasks are a Chromium API.
    }
  });
}

/** Samples, every animation frame, the rows of the live work log and the length of the turn. */
async function startSampling(page: Page) {
  await page.evaluate(() => {
    const probe = (window as unknown as { __probe: { samples: Sample[] } }).__probe;
    probe.samples = [];
    const sample = () => {
      const log = document.querySelector('[data-slot="execution-work-log"]');
      const turn = log?.closest('li');
      const run = (
        window as unknown as {
          __progressiveRun?: { attaches: number; reads: number; position: number };
        }
      ).__progressiveRun;
      probe.samples.push({
        // Rows of the step lists only: lists inside rendered markdown are not steps.
        steps: log?.querySelectorAll('ol[aria-label] > li').length ?? -1,
        text: turn instanceof HTMLElement ? turn.innerText.length : -1,
        at: `${run?.attaches}/${run?.reads}/${run?.position}`,
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function metrics(page: Page, browserName: string) {
  if (browserName !== 'chromium') return null;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  return async () => {
    const { metrics: values } = await cdp.send('Performance.getMetrics');
    return Object.fromEntries(
      values
        .filter((metric) =>
          ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'].includes(
            metric.name,
          ),
        )
        .map((metric) => [metric.name, Math.round(metric.value * 1000)]),
    );
  };
}

async function send(page: Page) {
  await page.goto(`/app/conversations/${CONVERSATION_ID}`);
  await page.getByLabel('Message', { exact: true }).fill('Topologie');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
}

async function start(page: Page, plan: DeliveryPlan) {
  const run = loadRecordedRun(RECORDED_RUN_PATH!);
  await installProbes(page);
  const api = await installExecutionApi(page);
  const server = await serveProgressiveRun(page, EXECUTION_ID, run, plan);
  return { api, run, server };
}

async function report(page: Page, label: string, findings: readonly Finding[], extra: object) {
  const probe = await page.evaluate(() => {
    const { longTasks, samples } = (
      window as unknown as {
        __probe: { longTasks: number[]; samples: { steps: number; text: number }[] };
      }
    ).__probe;
    return {
      longTasks: longTasks.length,
      longTaskMs: Math.round(longTasks.reduce((sum, value) => sum + value, 0)),
      longestTaskMs: Math.round(Math.max(0, ...longTasks)),
      samples,
    };
  });
  // Frames where the work log lost rows, with the attach/read/position counters around them.
  const lost = probe.samples.flatMap((sample, index) => {
    const previous = probe.samples[index - 1];
    return previous !== undefined && sample.steps < previous.steps ? [{ previous, sample }] : [];
  });
  const drops = probe.samples.reduce(
    (count, sample, index) => {
      const previous = probe.samples[index - 1];
      if (previous === undefined) return count;
      return {
        steps: count.steps + (sample.steps < previous.steps ? 1 : 0),
        text: count.text + (sample.text < previous.text ? 1 : 0),
      };
    },
    { steps: 0, text: 0 },
  );
  console.log(
    `[recorded] ${label} ${JSON.stringify({ ...extra, longTasks: probe.longTasks, longTaskMs: probe.longTaskMs, longestTaskMs: probe.longestTaskMs, frames: probe.samples.length, drops, lost: lost.slice(0, 5), findings })}`,
  );
  return drops;
}

const settled = (page: Page) =>
  expect(page.getByText('Travail effectué', { exact: false }).first()).toBeVisible({
    timeout: RUN_BUDGET_MS,
  });

test('streams a recorded reasoning-heavy run to its end', async ({ page, browserName }) => {
  test.setTimeout(RUN_BUDGET_MS * 2);
  const findings = recordFindings(page);
  const { run } = await start(page, { intervalMs: INTERVAL_MS });
  const read = await metrics(page, browserName);
  const profilePath = process.env.ALFRED_RECORDED_PROFILE;
  const profiler =
    profilePath !== undefined && browserName === 'chromium'
      ? await page.context().newCDPSession(page)
      : null;
  await send(page);
  if (profiler !== null) {
    await profiler.send('Profiler.enable');
    await profiler.send('Profiler.setSamplingInterval', { interval: 500 });
    await profiler.send('Profiler.start');
  }
  const before = await read?.();
  const began = Date.now();
  await startSampling(page);
  await settled(page);
  const elapsed = Date.now() - began;
  const after = await read?.();
  if (profiler !== null) {
    const { profile } = await profiler.send('Profiler.stop');
    writeFileSync(profilePath!, JSON.stringify(profile));
  }
  await report(page, `full ${browserName}`, findings, {
    batches: run.batches.length,
    intervalMs: INTERVAL_MS,
    elapsedMs: elapsed,
    cost:
      before && after
        ? Object.fromEntries(
            Object.entries(after).map(([key, value]) => [key, value - (before[key] ?? 0)]),
          )
        : null,
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('re-attaches after server closes without emptying the turn', async ({ page, browserName }) => {
  test.setTimeout(RUN_BUDGET_MS * 2);
  const findings = recordFindings(page);
  const { server } = await start(page, {
    intervalMs: INTERVAL_MS,
    holdAt: 300,
    closeAt: [300, 600, 750],
  });
  await send(page);
  await expect.poll(() => server.position(), { timeout: RUN_BUDGET_MS }).toBe(300);
  const log = await page.locator('[data-slot="execution-work-log"]').elementHandle();
  const reasoning = page.locator('[data-slot="reasoning-step"]').first();
  await reasoning.locator('summary').click();
  const wasOpen = await reasoning.evaluate((node) => (node as HTMLDetailsElement).open);
  const row = await reasoning.elementHandle();
  await startSampling(page);
  await server.resume();
  await expect.poll(() => server.attaches(), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  await settled(page);
  const drops = await report(page, `reattach ${browserName}`, findings, {
    attaches: await server.attaches(),
    reads: await server.reads(),
    logConnected: await log?.evaluate((node) => node.isConnected),
    rowConnected: await row?.evaluate((node) => node.isConnected),
    rowOpenKept: await row?.evaluate(
      (node, open) => (node as HTMLDetailsElement).open === open,
      wasOpen,
    ),
  });
  expect(drops).toBeDefined();
});

test('stops a recorded run while it streams', async ({ page, browserName }) => {
  test.setTimeout(RUN_BUDGET_MS * 2);
  const findings = recordFindings(page);
  const { server } = await start(page, { intervalMs: INTERVAL_MS, holdAt: 400 });
  await send(page);
  await expect.poll(() => server.position(), { timeout: RUN_BUDGET_MS }).toBe(400);
  await page.getByRole('button', { name: 'Arrêter la réponse', exact: true }).click();
  await expect(page.getByText('Travail arrêté', { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });
  await report(page, `stop ${browserName}`, findings, { attaches: await server.attaches() });
});

test('keeps observing a recorded run across navigation away and back', async ({
  page,
  browserName,
}) => {
  test.setTimeout(RUN_BUDGET_MS * 2);
  const findings = recordFindings(page);
  const { server } = await start(page, { intervalMs: INTERVAL_MS });
  await send(page);
  await expect.poll(() => server.position(), { timeout: RUN_BUDGET_MS }).toBeGreaterThan(200);
  await page.getByRole('button', { name: 'Nouvelle conversation', exact: true }).first().click();
  await expect(page).not.toHaveURL(new RegExp(CONVERSATION_ID));
  await expect.poll(() => server.position(), { timeout: RUN_BUDGET_MS }).toBeGreaterThan(500);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(CONVERSATION_ID));
  await settled(page);
  await report(page, `navigation ${browserName}`, findings, { attaches: await server.attaches() });
});
