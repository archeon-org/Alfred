import type { ExecutionWork, WorkStep } from '@alfred/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LiveTurn } from '@/contexts/chat-session/chat-session-context';
import {
  contentExtent,
  createTurnPublisher,
  REBUILD_MAX_MS,
  REBUILD_QUIET_MS,
  type TurnContent,
} from '@/contexts/chat-session/turn-publisher';

const step = (id: string, text = ''): WorkStep => ({
  id,
  kind: 'reasoning',
  label: '',
  status: 'running',
  startedAt: 1,
  finishedAt: null,
  text,
});
const work = (...steps: WorkStep[]): ExecutionWork => ({ steps, omittedSteps: 0 });

const INITIAL: LiveTurn = {
  assistantText: '',
  activities: [],
  work: work(),
  error: null,
  execution: null,
  status: 'streaming',
  userMessage: 'Salut',
  connection: 'connecting',
  stopPending: false,
};

function setup() {
  const models: { content: TurnContent } = {
    content: { assistantText: '', activities: [], work: work() },
  };
  const published: LiveTurn[] = [];
  const controller = new AbortController();
  const publisher = createTurnPublisher({
    initial: INITIAL,
    signal: controller.signal,
    dispatch: (turn) => published.push(turn),
    content: () => models.content,
  });
  return { models, published, controller, publisher };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('live turn publication', () => {
  it('coalesces content changes into one publication per animation frame', () => {
    const { models, published, publisher } = setup();
    for (let index = 1; index <= 50; index += 1) {
      models.content = { ...models.content, assistantText: 'x'.repeat(index) };
      publisher.progress();
    }
    expect(published).toHaveLength(0);
    vi.advanceTimersToNextFrame();
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ assistantText: 'x'.repeat(50), connection: 'connected' });
    vi.advanceTimersToNextFrame();
    expect(published).toHaveLength(1);
  });

  it('publishes other changes at once, after the pending content, and keeps their order', () => {
    const { models, published, publisher } = setup();
    models.content = { ...models.content, assistantText: 'Bonjour' };
    publisher.progress();
    publisher.update({ connection: 'recovering' });
    expect(published.map((turn) => [turn.assistantText, turn.connection])).toEqual([
      ['Bonjour', 'connected'],
      ['Bonjour', 'recovering'],
    ]);
    // The frame scheduled for the content was consumed: it cannot overwrite the later change.
    vi.advanceTimersToNextFrame();
    expect(published).toHaveLength(2);
    expect(publisher.turn.connection).toBe('recovering');
  });

  it('keeps the shown content during a rebuild until the replay caught up, then publishes it once', () => {
    const { models, published, publisher } = setup();
    models.content = { assistantText: 'Réponse', activities: [], work: work(step('r1', 'abc')) };
    publisher.progress();
    vi.advanceTimersToNextFrame();
    published.length = 0;
    publisher.hold();
    expect(publisher.holding).toBe(true);
    // The models restart empty and are rebuilt event by event.
    models.content = { assistantText: '', activities: [], work: work() };
    publisher.progress();
    publisher.update({ connection: 'connected', userMessage: 'Salut !' });
    expect(published.at(-1)).toMatchObject({ assistantText: 'Réponse', userMessage: 'Salut !' });
    models.content = { assistantText: '', activities: [], work: work(step('r1', 'abc')) };
    publisher.touch();
    // The replay ended before the answer was rebuilt: still held.
    publisher.replayed();
    vi.advanceTimersToNextFrame();
    expect(published.every((turn) => turn.assistantText === 'Réponse')).toBe(true);
    models.content = { assistantText: 'Réponse', activities: [], work: work(step('r1', 'abc')) };
    publisher.touch();
    expect(publisher.holding).toBe(false);
    expect(published.at(-1)?.work.steps).toEqual([step('r1', 'abc')]);
    expect(published.filter((turn) => turn.work.steps.length === 0)).toHaveLength(0);
  });

  it('publishes a replay below the shown content once the stream goes quiet or after the cap', () => {
    const { models, published, publisher } = setup();
    publisher.hold();
    expect(publisher.holding).toBe(false);
    models.content = { assistantText: 'Texte', activities: [], work: work() };
    publisher.progress();
    vi.advanceTimersToNextFrame();
    publisher.hold();
    models.content = { assistantText: 'Te', activities: [], work: work() };
    publisher.touch();
    // Before its replay ended, a rebuild is never published by a timer.
    vi.advanceTimersByTime(REBUILD_MAX_MS * 2);
    expect(publisher.holding).toBe(true);
    publisher.replayed();
    vi.advanceTimersByTime(REBUILD_QUIET_MS);
    expect(publisher.holding).toBe(false);
    expect(published.at(-1)?.assistantText).toBe('Te');
    publisher.hold();
    publisher.replayed();
    for (let elapsed = 0; elapsed < REBUILD_MAX_MS; elapsed += REBUILD_QUIET_MS / 2) {
      publisher.touch();
      vi.advanceTimersByTime(REBUILD_QUIET_MS / 2);
    }
    expect(publisher.holding).toBe(false);
  });

  it('drops a replay interrupted by the end of its attach and publishes a complete one', () => {
    const { models, published, publisher } = setup();
    models.content = { assistantText: 'Réponse', activities: [], work: work(step('r1', 'abc')) };
    publisher.progress();
    vi.advanceTimersToNextFrame();
    const shown = published.length;
    publisher.hold();
    models.content = { assistantText: '', activities: [], work: work(step('r1', 'a')) };
    publisher.end();
    expect(publisher.holding).toBe(false);
    expect(published).toHaveLength(shown);
    publisher.update({ connection: 'recovering' });
    expect(published.at(-1)).toMatchObject({ assistantText: 'Réponse', connection: 'recovering' });
    publisher.hold();
    models.content = { assistantText: 'Réponse', activities: [], work: work(step('r1', 'ab')) };
    publisher.replayed();
    expect(publisher.holding).toBe(true);
    publisher.end();
    expect(published.at(-1)?.work.steps).toEqual([step('r1', 'ab')]);
  });

  it('stops publishing once the observer is detached or the turn settled', () => {
    const { models, published, controller, publisher } = setup();
    publisher.update({ status: 'done' });
    models.content = { ...models.content, assistantText: 'late' };
    publisher.progress();
    vi.advanceTimersToNextFrame();
    expect(published).toHaveLength(1);
    controller.abort();
    publisher.update({ error: 'late' });
    expect(published).toHaveLength(1);
    publisher.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('measures content so that a replay of the same run is not growth', () => {
    const shown = { assistantText: 'ab', activities: [], work: work(step('r1', 'xyz')) };
    expect(contentExtent(shown)).toBe(contentExtent(structuredClone(shown)));
    expect(
      contentExtent({ ...shown, work: work({ ...step('r1', 'xyz'), status: 'completed' }) }),
    ).toBeGreaterThan(contentExtent(shown));
  });
});
