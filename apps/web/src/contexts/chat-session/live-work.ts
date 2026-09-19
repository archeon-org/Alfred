import {
  EXECUTION_REASONING_MAX_LENGTH,
  EXECUTION_WORK_MAX_STEPS,
  EXECUTION_WORK_TEXT_MAX_LENGTH,
  type ExecutionActivity,
  type ExecutionSnapshot,
  type ExecutionWork,
  type WorkStep,
  type WorkStepStatus,
} from '@alfred/contracts';

export const EMPTY_WORK: ExecutionWork = Object.freeze({ steps: [], omittedSteps: 0 });

/** A server moment as an AG-UI event carries it; absent or nonsensical values read as unknown. */
export type Moment = number | undefined;

const known = (at: Moment): number => (at !== undefined && at > 0 ? at : 0);

/**
 * The work log of the answer as AG-UI delivers it: narration (earlier assistant messages and a
 * specialist's own messages), reasoning with its text when exposed, empty generations, tool
 * calls, delegations and the specialists they invoke. Steps keep their first-seen order; the
 * answer itself is the open message of the orchestrator and never a step.
 */
export class LiveWork {
  private steps = new Map<string, WorkStep>();
  private order: string[] = [];
  private omitted = 0;
  private current: { id: string; startedAt: number; lastAt: number } | null = null;

  get view(): ExecutionWork {
    return {
      steps: this.order.flatMap((id) => {
        const step = this.steps.get(id);
        return step === undefined ? [] : [step];
      }),
      omittedSteps: this.omitted,
    };
  }

  reset(): void {
    this.steps = new Map();
    this.order = [];
    this.omitted = 0;
    this.current = null;
  }

  /**
   * The orchestrator opens a message; the one it replaces becomes narration with its text. The
   * message holds its place in the log from its start, so narration reads before the steps that
   * followed it, and it ends with its last content rather than when the next message began.
   */
  messageStart(id: string, at: Moment, previousText: string): void {
    const previous = this.current;
    if (previous !== null && previous.id !== id) {
      this.record({
        id: previous.id,
        kind: 'message',
        label: '',
        status: 'completed',
        startedAt: previous.startedAt,
        finishedAt: previous.lastAt || known(at),
        text: bounded(previousText, EXECUTION_WORK_TEXT_MAX_LENGTH),
      });
    }
    if (previous?.id === id) return;
    this.current = { id, startedAt: known(at), lastAt: known(at) };
    this.reserve(id);
  }

  messageDelta(id: string, at: Moment): void {
    if (this.current?.id === id && known(at) > 0) this.current.lastAt = known(at);
  }

  /** The end of an orchestrator message carries the moment of its last content. */
  messageEnd(id: string, at: Moment): void {
    if (this.current?.id === id && known(at) > 0)
      this.current.lastAt = Math.max(this.current.lastAt, known(at));
  }

  /** A specialist's own message, open while it grows under its invocation. */
  childMessageStart(id: string, at: Moment, owner: string): void {
    this.record({
      id,
      kind: 'message',
      label: '',
      status: 'running',
      startedAt: known(at),
      finishedAt: null,
      text: '',
      parentId: owner,
    });
  }

  childMessageDelta(id: string, delta: string, at: Moment): void {
    this.grow(id, delta, EXECUTION_WORK_TEXT_MAX_LENGTH, at);
  }

  childMessageEnd(id: string, at: Moment): void {
    this.settle(id, 'completed', at);
  }

  /** Reasoning shows as a marker until the API exposes its text through deltas. */
  reasoningStart(id: string, at: Moment, owner: string | undefined): void {
    this.record({
      id,
      kind: 'reasoning',
      label: '',
      status: 'running',
      startedAt: known(at),
      finishedAt: null,
      ...(owner === undefined ? {} : { parentId: owner }),
    });
  }

  reasoningDelta(id: string, delta: string, at: Moment): void {
    this.grow(id, delta, EXECUTION_REASONING_MAX_LENGTH, at);
  }

  reasoningEnd(id: string, at: Moment): void {
    this.settle(id, 'completed', at);
  }

  /** An empty model round trip: a step that started and finished with nothing to show. */
  generationStarted(id: string, at: Moment): void {
    this.record({
      id,
      kind: 'generation',
      label: '',
      status: 'running',
      startedAt: known(at),
      finishedAt: null,
    });
  }

  generationFinished(id: string, at: Moment): void {
    this.settle(id, 'completed', at);
  }

  /** True when the tool call is new to this answer. */
  toolStart(id: string, label: string, at: Moment, subagentRunId?: string): boolean {
    if (this.steps.has(id)) return false;
    this.record({
      id,
      kind: 'tool',
      label,
      status: 'running',
      startedAt: known(at),
      finishedAt: null,
      ...(subagentRunId === undefined ? {} : { parentId: subagentRunId }),
    });
    return true;
  }

  toolResult(id: string, content: string, at: Moment): void {
    this.settle(id, content === 'failed' || content === 'interrupted' ? content : 'completed', at);
  }

  /** A specialist at work: under its delegation when known, as its own step otherwise. */
  subagentStarted(id: string, name: string, at: Moment, parentToolCallId?: string): void {
    const delegation =
      parentToolCallId === undefined ? undefined : this.steps.get(parentToolCallId);
    if (delegation !== undefined) {
      this.steps.set(delegation.id, {
        ...delegation,
        kind: 'delegation',
        specialist: name,
        subagentStatus: 'running',
      });
      return;
    }
    if (this.steps.has(id)) return;
    this.record({
      id,
      kind: 'subagent',
      label: 'subagent',
      status: 'running',
      startedAt: known(at),
      finishedAt: null,
      specialist: name,
      subagentStatus: 'running',
    });
  }

  subagentFinished(id: string, at: Moment): void {
    this.endSubagent(id, 'completed', at);
  }

  subagentError(id: string, code: string | undefined, at: Moment): void {
    this.endSubagent(id, code === 'interrupted' ? 'interrupted' : 'failed', at);
  }

  /** The stream's count of omitted steps: steps beyond the bound never arrive one by one. */
  omittedFrom(omittedSteps: number): void {
    this.omitted = Math.max(this.omitted, omittedSteps);
  }

  /** Takes the work of a JSON read: the durable log is at least as complete as the stream's. */
  read(snapshot: ExecutionSnapshot): void {
    const work = snapshot.work ?? fromActivities(snapshot.activities, snapshot.execution.startedAt);
    this.steps = new Map(work.steps.map((step) => [step.id, step]));
    this.order = work.steps.map((step) => step.id);
    this.omitted = work.omittedSteps;
    if (this.current !== null) this.reserve(this.current.id);
  }

  /** Keeps the place of a step whose content is only known later; the view skips it until then. */
  private reserve(id: string): void {
    if (this.order.includes(id) || this.order.length >= EXECUTION_WORK_MAX_STEPS) return;
    this.order.push(id);
  }

  private record(step: WorkStep): void {
    if (this.steps.has(step.id)) return;
    if (this.order.includes(step.id)) {
      this.steps.set(step.id, step);
      return;
    }
    if (this.order.length >= EXECUTION_WORK_MAX_STEPS) {
      this.omitted += 1;
      return;
    }
    this.steps.set(step.id, step);
    this.order.push(step.id);
  }

  private grow(id: string, delta: string, limit: number, at: Moment): void {
    const step = this.steps.get(id);
    if (step === undefined || step.status !== 'running') return;
    this.steps.set(id, {
      ...step,
      text: bounded((step.text ?? '') + delta, limit),
      ...(known(at) > 0 ? { finishedAt: null } : {}),
    });
  }

  private settle(id: string, status: WorkStepStatus, at: Moment): void {
    const step = this.steps.get(id);
    if (step === undefined || step.status !== 'running') return;
    this.steps.set(id, { ...step, status, finishedAt: known(at) || null });
  }

  private endSubagent(id: string, status: WorkStepStatus, at: Moment): void {
    const step = this.steps.get(id);
    if (step === undefined || step.subagentStatus !== 'running') return;
    const own = step.kind === 'subagent' ? { status, finishedAt: known(at) || null } : {};
    this.steps.set(id, { ...step, subagentStatus: status, ...own });
  }
}

/** Bounds a JavaScript string length, never splitting a surrogate pair before the ellipsis. */
function bounded(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const end = limit - 1;
  const cut = /[\uD800-\uDBFF]/.test(text.charAt(end - 1)) ? end - 1 : end;
  return `${text.slice(0, cut)}…`;
}

/** An older API sends tool calls without the work log: they read as untimed tool steps. */
function fromActivities(
  activities: readonly ExecutionActivity[],
  startedAt: string | null,
): ExecutionWork {
  const at = startedAt === null ? 0 : Date.parse(startedAt);
  return {
    steps: activities.map((activity) => ({
      id: activity.id,
      kind: 'tool',
      label: activity.label,
      status: activity.status,
      startedAt: Number.isFinite(at) ? at : 0,
      finishedAt: null,
    })),
    omittedSteps: 0,
  };
}
