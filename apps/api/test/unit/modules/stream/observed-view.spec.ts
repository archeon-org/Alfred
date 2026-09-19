import { describe, expect, it } from 'vitest';

import type { ObservedWork } from '@api/modules/executions/infrastructure/langgraph/runtime-projection-work';
import {
  entryBytes,
  ObservedWorkCache,
  WORK_CACHE_MAX_ENTRIES,
} from '@api/modules/stream/application/observed-view';

/** A log with one narration step of `chars` characters, as a fresh read of the row would parse. */
const log = (chars: number): ObservedWork => ({
  steps: [
    {
      id: 'm1',
      kind: 'message',
      label: '',
      status: 'completed',
      startedAt: 1_000,
      finishedAt: 2_000,
      text: 'x'.repeat(chars),
    },
  ],
  omittedSteps: 0,
});
/** The log of an answer that needed no step. */
const empty = (): ObservedWork => ({ steps: [], omittedSteps: 0 });
const revision = (executionId: string, sequence: number) => ({
  executionId,
  sequence,
  key: JSON.stringify([sequence, `digest-${sequence}`, false, null]),
});

describe('observed work cache', () => {
  it('builds a revision once for every observer of the execution', () => {
    const cache = new ObservedWorkCache();
    let builds = 0;
    const build = () => {
      builds += 1;
      return log(10);
    };
    const first = cache.get(revision('a', 1), build);
    expect(cache.get(revision('a', 1), build)).toBe(first);
    expect(builds).toBe(1);
    expect(cache.bytes).toBe(entryBytes(revision('a', 1), first));
  });

  it('keeps only the latest revision of a long execution', () => {
    const cache = new ObservedWorkCache();
    let latest = log(0);
    // Every commit of a growing run is read once; each read parses its own copy of the text.
    for (let sequence = 1; sequence <= 1_000; sequence += 1)
      latest = cache.get(revision('a', sequence), () => log(1_000 + sequence));
    expect(cache.size).toBe(1);
    expect(cache.bytes).toBe(entryBytes(revision('a', 1_000), latest));
    expect(cache.get(revision('a', 1_000), () => log(1))).toBe(latest);
    // An observer whose read raced behind that commit gets its log without replacing the newest.
    const behind = cache.get(revision('a', 999), () => log(7));
    expect(behind.steps[0]?.text).toHaveLength(7);
    expect(cache.get(revision('a', 1_000), () => log(1))).toBe(latest);
    expect(cache.bytes).toBe(entryBytes(revision('a', 1_000), latest));
  });

  it('replaces the log of a revision that settled without another commit', () => {
    const cache = new ObservedWorkCache();
    cache.get(revision('a', 3), () => log(10));
    const settled = { ...revision('a', 3), key: JSON.stringify([3, 'digest-3', true, 5_000]) };
    const work = cache.get(settled, () => log(20));
    expect(cache.get(settled, () => log(1))).toBe(work);
    expect(cache.bytes).toBe(entryBytes(settled, work));
  });

  it('holds the logs of every execution within its byte budget, least recently read out first', () => {
    const size = entryBytes(revision('a', 1), log(1_000));
    const cache = new ObservedWorkCache({ maxBytes: size * 3 });
    const logs = ['a', 'b', 'c'].map((id) => cache.get(revision(id, 1), () => log(1_000)));
    // Reading `a` again makes `b` the least recently read.
    expect(cache.get(revision('a', 1), () => log(1))).toBe(logs[0]);
    cache.get(revision('d', 1), () => log(1_000));
    expect(cache.bytes).toBe(size * 3);
    expect(cache.get(revision('a', 1), () => log(1))).toBe(logs[0]);
    expect(cache.get(revision('c', 1), () => log(1))).toBe(logs[2]);
    expect(cache.get(revision('b', 1), () => log(1_000))).not.toBe(logs[1]);
    expect(cache.bytes).toBeLessThanOrEqual(size * 3);
  });

  it('counts the logs of answers without steps against the byte budget', () => {
    const size = entryBytes(revision('execution-0000', 1), empty());
    const cache = new ObservedWorkCache({
      maxBytes: size * 10,
      maxEntries: Number.MAX_SAFE_INTEGER,
    });
    for (let index = 0; index < 1_000; index += 1)
      cache.get(revision(`execution-${String(index).padStart(4, '0')}`, 1), empty);
    expect(cache.size).toBe(10);
    expect(cache.bytes).toBe(size * 10);
  });

  it('keeps a bounded number of executions, however small their logs', () => {
    const cache = new ObservedWorkCache();
    const id = (index: number) => `execution-${String(index).padStart(5, '0')}`;
    const logs = Array.from({ length: WORK_CACHE_MAX_ENTRIES * 5 }, (_, index) =>
      cache.get(revision(id(index), 1), empty),
    );
    expect(cache.size).toBe(WORK_CACHE_MAX_ENTRIES);
    expect(cache.bytes).toBe(WORK_CACHE_MAX_ENTRIES * entryBytes(revision(id(0), 1), empty()));
    const newest = WORK_CACHE_MAX_ENTRIES * 5 - 1;
    expect(cache.get(revision(id(newest), 1), empty)).toBe(logs[newest]);
    expect(cache.get(revision(id(0), 1), empty)).not.toBe(logs[0]);
  });

  it('never keeps a log larger than the whole budget', () => {
    const cache = new ObservedWorkCache({ maxBytes: entryBytes(revision('a', 1), log(100)) });
    cache.get(revision('a', 1), () => log(10));
    const huge = cache.get(revision('b', 1), () => log(1_000));
    expect(cache.get(revision('b', 1), () => log(1_000))).not.toBe(huge);
    expect(cache.bytes).toBe(entryBytes(revision('a', 1), log(10)));
  });

  it('drops the logs nobody read for a while', () => {
    let now = 0;
    const cache = new ObservedWorkCache({ idleMs: 30_000, now: () => now });
    const settled = cache.get(revision('a', 9), () => log(500));
    const live = cache.get(revision('b', 1), () => log(500));
    now = 20_000;
    expect(cache.get(revision('b', 1), () => log(1))).toBe(live);
    now = 30_000;
    // `a` was last read 30 s ago, `b` only 10 s ago.
    expect(cache.get(revision('b', 1), () => log(1))).toBe(live);
    expect(cache.size).toBe(1);
    expect(cache.bytes).toBe(entryBytes(revision('b', 1), live));
    expect(cache.get(revision('a', 9), () => log(500))).not.toBe(settled);
  });

  it('counts an entry and its keys, then two bytes per code unit of every step string', () => {
    const at = revision('a', 1);
    const work = log(1_000);
    const bare = entryBytes(at, { ...work, steps: [{ ...work.steps[0]!, id: '', text: '' }] });
    expect(entryBytes(at, work)).toBe(bare + 2 * (1_000 + 'm1'.length));
    expect(entryBytes(at, empty())).toBeGreaterThan(0);
    expect(entryBytes({ ...at, key: `${at.key}xy` }, empty())).toBe(entryBytes(at, empty()) + 4);
    expect(entryBytes({ ...at, executionId: 'abc' }, empty())).toBe(entryBytes(at, empty()) + 4);
  });
});
