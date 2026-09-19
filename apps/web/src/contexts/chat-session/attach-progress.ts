import type { WorkStepStatus } from '@alfred/contracts';

import type { TurnContent } from '@/contexts/chat-session/turn-publisher';

interface StepMark {
  readonly settled: boolean;
  readonly text: number;
  readonly subagentSettled: boolean;
}

const done = (status: WorkStepStatus | undefined): boolean =>
  status !== undefined && status !== 'running';

/**
 * What any attach or read has shown of a run, element by element: every step seen, how far its
 * text grew, whether it and its specialist ended, how far each answer grew, the tool calls and the
 * omitted steps. An attach progressed when it brings any element beyond this record. A replay of
 * known content never does, while a new step still does when a shown step's text later reads
 * shorter (an intermediate answer bounded as narration) — a total size would hide it.
 */
export class AttachProgress {
  private readonly steps = new Map<string, StepMark>();
  /** Longest text of each answer, by how many earlier answers turned into root narration. */
  private readonly answers = new Map<number, number>();
  private readonly activities = new Set<string>();
  private omitted = 0;

  /** Takes in the content; true when it holds anything never recorded before. */
  record(content: TurnContent): boolean {
    let progressed = false;
    const answer = content.work.steps.filter(
      (step) => step.kind === 'message' && step.parentId === undefined,
    ).length;
    if (content.assistantText.length > (this.answers.get(answer) ?? 0)) {
      this.answers.set(answer, content.assistantText.length);
      progressed = true;
    }
    for (const activity of content.activities) {
      const key = `${activity.id}:${activity.status}`;
      if (this.activities.has(key)) continue;
      this.activities.add(key);
      progressed = true;
    }
    if (content.work.omittedSteps > this.omitted) {
      this.omitted = content.work.omittedSteps;
      progressed = true;
    }
    for (const step of content.work.steps) {
      const known = this.steps.get(step.id);
      const next: StepMark = {
        settled: (known?.settled ?? false) || done(step.status),
        text: Math.max(known?.text ?? 0, step.text?.length ?? 0),
        subagentSettled: (known?.subagentSettled ?? false) || done(step.subagentStatus),
      };
      if (
        known === undefined ||
        next.settled !== known.settled ||
        next.text !== known.text ||
        next.subagentSettled !== known.subagentSettled
      ) {
        this.steps.set(step.id, next);
        progressed = true;
      }
    }
    return progressed;
  }
}
