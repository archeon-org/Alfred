import { readFileSync } from 'node:fs';

import type { ExecutionSnapshot } from '@alfred/contracts';
import type { Page } from '@playwright/test';

import type { ProgressiveRun, WireEvent } from './progressive-run';
import { defaultSeed } from './workspace-api';

/**
 * A recorded run exported outside the repository (`ALFRED_RECORDED_RUN`): the AG-UI batches the
 * API translated from a captured native stream, the re-synthesis and JSON read at some positions
 * and the Stop sequence there. Recordings hold conversation content and are never committed; the
 * specs that use one are skipped without it.
 */
export const RECORDED_RUN_PATH = process.env.ALFRED_RECORDED_RUN;

/** A console message, uncaught error or failed request seen by the page, verbatim. */
export interface Finding {
  readonly kind: string;
  readonly text: string;
  readonly at: number;
}

/** Collects every console error and warning, page error and failed request of the page. */
export function recordFindings(page: Page): readonly Finding[] {
  const started = Date.now();
  const findings: Finding[] = [];
  const push = (kind: string, text: string) =>
    findings.push({ kind, text, at: Date.now() - started });
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      push(`console.${message.type()}`, message.text());
  });
  page.on('pageerror', (error) => push('pageerror', `${error.name}: ${error.message}`));
  page.on('requestfailed', (request) =>
    push(
      'requestfailed',
      `${request.method()} ${new URL(request.url()).pathname} ${request.failure()?.errorText ?? ''}`,
    ),
  );
  return findings;
}

interface RecordedExport {
  readonly batches: WireEvent[][];
  readonly resync: Record<string, WireEvent[]>;
  readonly stop: Record<string, WireEvent[][]>;
  readonly reads: Record<string, ExecutionSnapshot>;
  readonly cancelledReads: Record<string, ExecutionSnapshot>;
}

const numbered = <T>(record: Record<string, T>): Record<number, T> =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [Number(key), value]));

/** Loads a recording, filed under the mocked workspace's conversation. */
export function loadRecordedRun(path: string): ProgressiveRun {
  const conversation = defaultSeed().conversations[0]!;
  const raw = readFileSync(path, 'utf8');
  const recorded = JSON.parse(raw) as RecordedExport;
  const own = (event: WireEvent): WireEvent => {
    if (event.type !== 'STATE_SNAPSHOT') return event;
    const { snapshot } = event as WireEvent & { readonly snapshot: object };
    return { ...event, snapshot: { ...snapshot, conversation } } as WireEvent;
  };
  const read = (snapshot: ExecutionSnapshot): ExecutionSnapshot => ({
    ...snapshot,
    conversation: { ...snapshot.conversation, ...conversation },
  });
  const events = (batch: readonly WireEvent[]) => batch.map(own);
  return {
    batches: recorded.batches.map(events),
    resync: numbered(
      Object.fromEntries(Object.entries(recorded.resync).map(([k, v]) => [k, events(v)])),
    ),
    stops: numbered(
      Object.fromEntries(Object.entries(recorded.stop).map(([k, v]) => [k, v.map(events)])),
    ),
    reads: numbered(
      Object.fromEntries(Object.entries(recorded.reads).map(([k, v]) => [k, read(v)])),
    ),
    cancelledReads: numbered(
      Object.fromEntries(Object.entries(recorded.cancelledReads).map(([k, v]) => [k, read(v)])),
    ),
  };
}
