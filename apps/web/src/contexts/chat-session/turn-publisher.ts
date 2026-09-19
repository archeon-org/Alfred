import type { LiveTurn } from '@/contexts/chat-session/chat-session-context';

/** The part of the turn rebuilt from AG-UI events: the answer and the account of the work. */
export type TurnContent = Pick<LiveTurn, 'assistantText' | 'activities' | 'work'>;

const CONTENT_KEYS = ['assistantText', 'activities', 'work'] as const;

/**
 * A replay ends with the first cursor of the attach. When the replayed content stays below what
 * is shown (the run reshaped its work), it is published once the stream goes quiet, and never
 * later than the cap after the replay ended.
 */
export const REBUILD_QUIET_MS = 1_000;
export const REBUILD_MAX_MS = 3_000;

interface PublisherOptions {
  readonly initial: LiveTurn;
  readonly signal: AbortSignal;
  readonly dispatch: (turn: LiveTurn) => void;
  /** The content as the live models currently hold it. */
  readonly content: () => TurnContent;
}

/** One animation frame, or a short timer where frames are unavailable. */
function nextFrame(callback: () => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    const handle = requestAnimationFrame(callback);
    return () => cancelAnimationFrame(handle);
  }
  const handle = setTimeout(callback, 16);
  return () => clearTimeout(handle);
}

/** A measure that grows with every change a run makes to its answer and its work. */
export function contentExtent(content: TurnContent): number {
  let extent = content.assistantText.length + content.activities.length;
  for (const step of content.work.steps)
    extent += 1 + (step.status === 'running' ? 0 : 1) + (step.text?.length ?? 0);
  return extent + content.work.omittedSteps;
}

/**
 * Publishes the live turn to React. Content changes of the stream (message, reasoning and tool
 * deltas) are coalesced into at most one publication per animation frame; every other change
 * publishes at once, after the pending content, so changes keep their order. While a re-attach
 * rebuilds the run from its replay, the content published before it stays on screen, untouched,
 * until the rebuilt content has caught up and replaces it in one publication.
 */
export function createTurnPublisher({ initial, signal, dispatch, content }: PublisherOptions) {
  let turn = initial;
  let pending = false;
  let cancelFrame: (() => void) | null = null;
  let holding = false;
  /** Extent of the content kept on screen during a rebuild, and whether its replay ended. */
  let shown = 0;
  let replayed = false;
  let quiet: ReturnType<typeof setTimeout> | undefined;
  let cap: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    cancelFrame?.();
    cancelFrame = null;
    if (!pending || holding) return;
    pending = false;
    // A detached observer no longer changes its turn.
    if (signal.aborted || turn.status !== 'streaming') return;
    turn = { ...turn, ...content(), connection: 'connected' };
    dispatch(turn);
  };
  const release = () => {
    clearTimeout(quiet);
    clearTimeout(cap);
    if (!holding) return;
    holding = false;
    pending = true;
    flush();
  };
  const touch = () => {
    if (!holding || !replayed) return;
    if (contentExtent(content()) >= shown) {
      release();
      return;
    }
    clearTimeout(quiet);
    quiet = setTimeout(release, REBUILD_QUIET_MS);
  };

  return {
    get turn(): LiveTurn {
      return turn;
    },
    get holding(): boolean {
      return holding;
    },
    /** The stream changed the content: publish it with the next frame. */
    progress(): void {
      if (holding) return;
      pending = true;
      cancelFrame ??= nextFrame(flush);
    },
    /**
     * Publishes a change now, after any pending content. While a rebuild is held, the published
     * content is kept and only the other fields change.
     */
    update(patch: Partial<LiveTurn>): void {
      flush();
      if (signal.aborted) return;
      const next = { ...turn, ...patch };
      if (holding) for (const key of CONTENT_KEYS) Object.assign(next, { [key]: turn[key] });
      turn = next;
      dispatch(turn);
    },
    /** A re-attach replays the run: keep what is on screen while the models are rebuilt. */
    hold(): void {
      flush();
      shown = contentExtent(turn);
      replayed = false;
      if (shown === 0) return;
      holding = true;
      clearTimeout(quiet);
      clearTimeout(cap);
    },
    /**
     * An event of the stream was applied. A held rebuild is published once its replay ended and
     * the rebuilt content reaches what is shown, or once the stream goes quiet.
     */
    touch,
    /** The replay of the attach ended: the rebuilt content is the run as the API holds it. */
    replayed(): void {
      if (!holding || replayed) return;
      replayed = true;
      cap = setTimeout(release, REBUILD_MAX_MS);
      touch();
    },
    /** Publishes the rebuilt content now: the run settled. */
    release,
    /**
     * The attach ended. A complete replay is published; an interrupted one is dropped and the
     * shown content stays until a read or the next attach rebuilds it.
     */
    end(): void {
      if (!holding) return;
      if (replayed) {
        release();
        return;
      }
      holding = false;
      pending = false;
      clearTimeout(quiet);
      clearTimeout(cap);
    },
    dispose(): void {
      clearTimeout(quiet);
      clearTimeout(cap);
      cancelFrame?.();
      cancelFrame = null;
    },
  };
}

export type TurnPublisher = ReturnType<typeof createTurnPublisher>;
